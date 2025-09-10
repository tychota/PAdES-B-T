/**
 * CPS (Carte de Professionnel de Santé) card integration types
 * For Icanopee middleware integration
 */

export interface CPSCardInfo {
  serialNumber: string;
  validityDate: string;
  cardType: number; // 2 = CPS
  profession: string;
  professionDescription: string;
  speciality?: string;
  specialityDescription?: string;
  holderName: string;
  holderGivenName: string;
  internalId: string;
}

export interface PcscReader {
  s_name: string;
  s_readerName?: string;
  s_slotType: string;
  i_slotType: number; // 3 = CPS card
  i_accessMode: number; // 1 = Full PC/SC
  s_accessMode: string;
}

export interface IcanopeeSession {
  sessionId: string;
  timeoutInSeconds: number;
  serviceVersion: string;
  isProduction: boolean;
}

export interface CPSSigningRequest {
  sessionId: string;
  readerName: string;
  pinCode: string;
  digestType: number; // 1 = SHA-256
  dataToSignInBase64: string; // base64 - NEW API field
}

export interface CPSSigningResponse {
  status: "OK" | "ERROR";
  signature?: string; // base64
  /** @deprecated Auth signature not used - only signature certificate is needed */
  authSignature?: string; // base64 - Returned by API but not used
  signatureCertificate?: string; // PEM
  digest?: string; // base64
  apiErrorCode?: number;
  apiErrorType?: number;
  apiErrorContext?: string;
  apiErrorDescription?: string;
}

export interface IcanopeeConfig {
  endpoint: string; // https://localhost.icanopee.net:9982
  dcParameter: string; // base64
  timeoutSeconds: number;
}
