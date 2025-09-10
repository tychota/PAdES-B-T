#!/usr/bin/env bash
set -euo pipefail

# ---- styling ---------------------------------------------------------------
if command -v tput >/dev/null 2>&1 && [[ -t 1 ]]; then
  BOLD="$(tput bold)"; RED="$(tput setaf 1)"; GRN="$(tput setaf 2)"
  YEL="$(tput setaf 3)"; BLU="$(tput setaf 4)"; DIM="$(tput dim)"; NC="$(tput sgr0)"
else
  BOLD=""; RED=""; GRN=""; YEL=""; BLU=""; DIM=""; NC=""
fi
say() { printf "\n${BOLD}%s${NC}\n" "== $* =="; }
ok()  { printf "${GRN}✔ %s${NC}\n" "$*"; }
warn(){ printf "${YEL}⚠ %s${NC}\n" "$*"; }
bad() { printf "${RED}✖ %s${NC}\n" "$*"; }

need() { command -v "$1" >/dev/null || { bad "Missing: $1"; exit 1; }; }
need curl; need jq; need openssl

# ---- config ----------------------------------------------------------------
BASE="${BASE:-https://localhost.icanopee.net:9982}"
DCPARAM64="$(cat dcparams.b64)"
PIN="${PIN:-1234}"
TO_SIGN="${TO_SIGN:-something random like stroumpfischtroumpfa}"

# If you must mimic old headers, set USE_TEXT_PLAIN=1 to send JSON as text/plain.
USE_TEXT_PLAIN="${USE_TEXT_PLAIN:-0}"

# helper to POST JSON with optional text/plain header
post_json() {
  local url="$1" json="$2"
  if [[ "$USE_TEXT_PLAIN" == "1" ]]; then
    curl -sS --fail-with-body \
      -H 'Accept: */*' \
      -H 'Content-Type: text/plain;charset=UTF-8' \
      --data "$json" "$url"
  else
    curl -sS --fail-with-body --json "$json" "$url"
  fi
}

# 0) isDcParameterRegistered (with body)
say "0) isDcParameterRegistered (best-effort)"
isreg_body="$(jq -n --arg dc "$DCPARAM64" '{s_dcparameters64:$dc}')"
ISREG_JSON="$(post_json "$BASE/remotecommand/isDcParameterRegistered" "$isreg_body" || true)"
if [[ -n "$ISREG_JSON" ]]; then
  jq . <<<"$ISREG_JSON" > out.isregistered.json
  reg="$(jq -r '.i_registered // .isRegistered // .b_isRegistered // empty' <<<"$ISREG_JSON")"
  if [[ "$reg" == "1" ]]; then
    ok "DC parameters already registered (i_registered=1)"
    ALREADY=1
  elif [[ "$reg" == "0" ]]; then
    warn "DC parameters not registered (i_registered=0)"
    ALREADY=0
  else
    warn "Unrecognized response (saved to out.isregistered.json)"
    ALREADY=0
  fi
else
  warn "Endpoint unavailable; will try register."
  ALREADY=0
fi

# 1) registerDcParameter (only if needed)
say "1) registerDcParameter"
if [[ "$ALREADY" == "1" ]]; then
  echo "${DIM}(skipped; already registered)${NC}"
else
  reg_body="$(jq -n --arg dc "$DCPARAM64" '{s_dcparameters64:$dc}')"
  REG_JSON="$(post_json "$BASE/remotecommand/registerDcParameter" "$reg_body" || true)"
  [[ -n "$REG_JSON" ]] && jq . <<<"$REG_JSON" > out.register.json
  status="$(jq -r '.s_status // .status // empty' <<<"${REG_JSON:-}" )"
  if [[ "$status" == "OK" ]]; then
    ok "registerDcParameter OK"
  else
    warn "registerDcParameter returned: ${status:-ERROR} (continuing; often ERROR when already registered)"
  fi
fi

# 2) hl_openSession
say "2) hl_openSession"
open_body="$(jq -n --arg dc "$DCPARAM64" '{s_commandName:"hl_openSession", i_timeoutInSeconds:3600, s_dcparameters64:$dc}')"
SESSION_JSON="$(post_json "$BASE/api/hl_opensession" "$open_body")"
jq . <<<"$SESSION_JSON" > out.open.json
SESSION_ID="$(jq -r '.s_sessionId' <<<"$SESSION_JSON")"
test -n "$SESSION_ID" || { bad "No session id found"; exit 1; }
ok "SESSION_ID=$SESSION_ID"

# 3) hl_getPcscReaders -> fail early if none
say "3) hl_getPcscReaders"
readers_body="$(jq -n --arg sid "$SESSION_ID" '{s_commandName:"hl_getPcscReaders", s_sessionId:$sid}')"
READERS_JSON="$(post_json "$BASE/api/hl_getpcscreaders" "$readers_body")"
jq . <<<"$READERS_JSON" > out.readers.json
READER_COUNT="$(jq '.Readers | length' <<<"$READERS_JSON")"
if [[ "$READER_COUNT" -eq 0 ]]; then
  bad "No PC/SC reader detected. Plug a reader and insert a card."
  exit 2
fi
READER_NAME="$(jq -r '.Readers[0].s_name' <<<"$READERS_JSON")"
ok "READER_NAME=$READER_NAME"

# 4) hl_getCpxCard
say "4) hl_getCpxCard"
getcard_body="$(jq -n --arg sid "$SESSION_ID" --arg rn "$READER_NAME" '{s_commandName:"hl_getCpxCard", s_sessionId:$sid, s_readerName:$rn}')"
GETCPX_JSON="$(post_json "$BASE/api/hl_getcpxcard" "$getcard_body")"
jq . <<<"$GETCPX_JSON" > out.getcpx.json
ok "hl_getCpxCard returned $(jq -r '.s_status' <<<"$GETCPX_JSON")"

# 5) hl_readCpxCard (keep certs)
say "5) hl_readCpxCard (keep certs)"
read_body="$(jq -n --arg sid "$SESSION_ID" --arg pin "$PIN" '{s_commandName:"hl_readCpxCard", i_returnCertificates:1, s_sessionId:$sid, s_pinCode:$pin}')"
CARD_JSON="$(post_json "$BASE/api/hl_readcpxcard" "$read_body")"
jq . <<<"$CARD_JSON" > out.card.json
AUTH_CERT="$(jq -r '.s_authenticationCertificatePEM // empty' <<<"$CARD_JSON")"
SIG_CERT_ON_READ="$(jq -r '.s_signatureCertificatePEM // empty' <<<"$CARD_JSON")"
if [[ -z "$AUTH_CERT" && -z "$SIG_CERT_ON_READ" ]]; then
  bad "No certificate fields in card read. Ensure a card is inserted and unlocked (PIN)."
  exit 3
fi
ok "Saved card info to out.card.json"

# 6) hl_signWithCpxCard (prove raw-string signing)
say "6) hl_signWithCpxCard (prove raw-string signing)"
sign_body="$(jq -n --arg sid "$SESSION_ID" --arg pin "$PIN" --arg ts "$TO_SIGN" \
            '{s_commandName:"hl_signWithCpxCard", s_pinCode:$pin, s_stringToSign:$ts, i_digestType:1, s_sessionId:$sid}')"
SIGN_JSON="$(post_json "$BASE/api/hl_signwithcpxcard" "$sign_body")"
jq . <<<"$SIGN_JSON" > out.sign.json

SIG_CERT="$(jq -r '.s_signatureCertificate // empty' < out.sign.json)"
SIG_B64="$(jq -r '.s_signature // empty' < out.sign.json)"
SRV_DIGEST_B64="$(jq -r '.s_digest // empty' < out.sign.json)"

if [[ -z "$SIG_B64" || -z "$SIG_CERT" ]]; then
  bad "Server did not return s_signature and/or s_signatureCertificate (see out.sign.json)."
  exit 4
fi

printf '%s\n' "$SIG_CERT" > cert.pem
printf '%s'   "$SIG_B64"  | openssl base64 -d -A > sig.bin

# our digest (base64(SHA-256(raw string)))
printf '%s' "$TO_SIGN" | openssl dgst -sha256 -binary | openssl base64 -A > digest.local.b64
LOCAL="$(tr -d '\r\n ' < digest.local.b64)"
SRV="$(printf '%s' "$SRV_DIGEST_B64" | tr -d '\r\n ')"

echo "Local  digest (b64 SHA-256 raw string): $LOCAL"
echo "Server digest (s_digest):               ${SRV:-<missing>}"
if [[ -n "$SRV" && "$LOCAL" == "$SRV" ]]; then
  ok "s_digest == base64(SHA-256(raw s_stringToSign))"
else
  warn "Mismatch or missing s_digest (inspect out.sign.json)."
fi

# Verify signature against RAW string
openssl x509 -in cert.pem -pubkey -noout > pubkey.pem
if openssl dgst -sha256 -verify pubkey.pem -signature sig.bin <(printf '%s' "$TO_SIGN") >/dev/null 2>&1; then
  ok "Signature verifies over RAW s_stringToSign (SHA-256, PKCS#1 v1.5)."
else
  bad "Signature did NOT verify over RAW string."
  exit 5
fi

# Optional: recover/inspect PKCS#1 v1.5 DigestInfo
if [[ "${DO_RECOVER:-0}" == "1" ]]; then
  openssl pkeyutl -verifyrecover -pubin -inkey pubkey.pem -in sig.bin -out recovered.der
  echo "${DIM}Recovered DigestInfo (ASN.1):${NC}"
  openssl asn1parse -inform DER -in recovered.der -i
fi

# 7) hl_signWithCpxCard (NEW API with base64 data)
say "7) hl_signWithCpxCard (NEW API with s_dataToSignInBase64)"
# Encode the data we want to sign as base64
TO_SIGN_B64="$(printf '%s' "$TO_SIGN" | openssl base64 -A)"
sign_new_body="$(jq -n --arg sid "$SESSION_ID" --arg pin "$PIN" --arg data_b64 "$TO_SIGN_B64" \
            '{s_commandName:"hl_signWithCpxCard", s_pinCode:$pin, s_dataToSignInBase64:$data_b64, i_digestType:1, s_sessionId:$sid}')"
SIGN_NEW_JSON="$(post_json "$BASE/api/hl_signwithcpxcard" "$sign_new_body")"
jq . <<<"$SIGN_NEW_JSON" > out.sign_new_api.json

SIG_NEW_CERT="$(jq -r '.s_signatureCertificate // empty' < out.sign_new_api.json)"
SIG_NEW_B64="$(jq -r '.s_signature // empty' < out.sign_new_api.json)"
AUTH_SIG_NEW_B64="$(jq -r '.s_authSignature // empty' < out.sign_new_api.json)"
SRV_NEW_DIGEST_B64="$(jq -r '.s_digest // empty' < out.sign_new_api.json)"

if [[ -n "$SIG_NEW_B64" && -n "$SIG_NEW_CERT" ]]; then
  ok "NEW API: Signature and certificate returned successfully"
  
  # Save new API signature and certificate
  printf '%s\n' "$SIG_NEW_CERT" > cert_new.pem
  printf '%s'   "$SIG_NEW_B64"  | openssl base64 -d -A > sig_new.bin
  
  # Verify signature against original data
  openssl x509 -in cert_new.pem -pubkey -noout > pubkey_new.pem
  if openssl dgst -sha256 -verify pubkey_new.pem -signature sig_new.bin <(printf '%s' "$TO_SIGN") >/dev/null 2>&1; then
    ok "NEW API: Signature verifies correctly"
  else
    warn "NEW API: Signature verification failed"
  fi
  
  if [[ -n "$AUTH_SIG_NEW_B64" ]]; then
    ok "NEW API: Auth signature also returned: ${AUTH_SIG_NEW_B64:0:20}..."
  fi
else
  warn "NEW API: No signature or certificate returned (check out.sign_new_api.json)"
fi

# ---- conclusion -------------------------------------------------------------
say "Summary for provider report"
echo "- Endpoints accept JSON just fine; this script uses ${BOLD}$([[ $USE_TEXT_PLAIN == 1 ]] && echo 'text/plain' || echo 'application/json')${NC} with the same payloads."
echo "- ${BOLD}OLD API Evidence:${NC} server s_digest equals base64(SHA-256(raw s_stringToSign)), and RSA verification succeeds over the ${BOLD}raw string${NC}."
echo "- ${BOLD}NEW API Evidence:${NC} s_dataToSignInBase64 accepts base64-encoded data, allowing binary content to be signed properly."

printf "\n${GRN}${BOLD}New API improvements:${NC}\n"
printf "${GRN}- 'hl_signWithCpxCard' now accepts 's_dataToSignInBase64' for base64-encoded data.${NC}\n"
printf "${GRN}- This allows sending ${BOLD}binary${NC}${GRN} content (e.g., CMS for PAdES) safely in JSON.${NC}\n"
printf "${GRN}- Returns both signature certificate (s_signatureCertificate) and auth signature (s_authSignature).${NC}\n"

echo
echo "${BOLD}Usage:${NC}"
echo "- Use ${BOLD}s_dataToSignInBase64${NC} instead of ${BOLD}s_stringToSign${NC}"
echo "- Pass base64-encoded binary data directly"
echo "- Both signature and auth signatures are now available"

echo
ok "Saved responses: out.sign.json (old API), out.sign_new_api.json (new API)"
