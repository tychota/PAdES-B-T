# A Technical Guide to Implementing a PAdES-Compliant Signature Service for the French E-Prescription System

## 1. The Regulatory and Functional Mandate

The architecture of a secure digital signature service for the French healthcare system is not a matter of mere technical preference. It is the direct and necessary implementation of a cascade of national strategies, legal frameworks, and technical doctrines. The entire system is predicated on establishing unimpeachable legal validity for digital health documents, a concept known in French law as "force probante" (evidentiary value). Understanding this top-down chain of requirements—from the high-level political objectives of the "Ségur du numérique en santé" program to the granular security levels defined by the Agence du Numérique en Santé (ANS)—is the essential prerequisite for designing a compliant and defensible e-prescription signature service. The technical choices detailed in this guide are the logical conclusion of this regulatory landscape.

### 1.1. The "Ordonnance Numérique" Ecosystem

The "Ordonnance Numérique" (digital prescription) initiative is a cornerstone of the French government's multi-year, multi-billion euro "Ségur du numérique en santé" program.[^1] The overarching goal of "Ségur" is to accelerate and generalize the fluid and secure sharing of health data among all actors in the healthcare ecosystem: city-based physicians, hospitals, medical biology labs, pharmacies, and patients themselves.[^1] The e-prescription service directly serves this goal by dematerializing the entire prescription lifecycle, from creation to dispensation, aiming to enhance patient safety by reducing transcription errors, improve care coordination, and combat prescription fraud.[^4]

The workflow of the "Ordonnance Numérique" is a carefully designed hybrid system that bridges the physical and digital realms, facilitating a gradual transition for all healthcare professionals. The process unfolds as follows:

1. **Prescription Generation**: A healthcare professional (e.g., a doctor) uses their "Ségur"-referenced practice management software to create a prescription. This software connects to a national teleservice managed by the French National Health Insurance (Assurance Maladie).[^4]

2. **Secure Registration**: The prescription data is transmitted to and stored on the secure servers of the Assurance Maladie. The system generates a unique prescription identifier for this specific prescription.[^4]

3. **Patient-Held QR Code**: The prescriber's software prints a paper version of the prescription that includes a QR code. This QR code does not contain the patient's medical data or the prescription details; it solely contains the unique prescription identifier.[^7] This paper document serves as the key for the patient to access their prescription at the pharmacy.

4. **Dispensation at the Pharmacy**: The patient presents the paper prescription at the pharmacy of their choice. The pharmacist scans the QR code using their own "Ségur"-compliant software. The software uses the identifier to securely retrieve the full, structured prescription data from the Assurance Maladie servers. This retrieval process requires the pharmacist to be strongly authenticated using their professional smart card (Carte de Professionnel de Santé, or CPx).[^5]

5. **Patient Access via "Mon espace santé"**: In parallel, the generated e-prescription is automatically sent to the patient's personal digital health space, "Mon espace santé," where it is stored in their Dossier Médical Partagé (DMP), or Shared Medical Record. This empowers patients with direct access to their own health data and a consolidated view of their care journey.[^4]

This system is not optional. The legal framework, specifically Ordinance No. 2020-1408 and Decree No. 2023-1222, mandates that healthcare professionals must conform to this dematerialized process by December 31, 2024, at the latest.[^5] This firm deadline makes the implementation of compliant software solutions an urgent priority for all vendors in the French healthcare IT market.

### 1.2. The "Force Probante" Imperative

For a digital document to replace its paper counterpart in a high-stakes environment like healthcare, it must possess equivalent legal standing. The French legal system addresses this through the concept of "force probante," or evidentiary value. The French Public Health Code (Code de la santé publique) provides the legal basis for this, establishing that a digital health document can have the same legal force as a paper original, provided it meets certain technical and procedural conditions.[^9]

Crucially, _Article L1111-31_ of this code delegates the responsibility for defining these conditions to the Agence du Numérique en Santé (ANS) through the publication of specific technical referentials.[^9] This makes the ANS "Référentiel Force Probante" not merely a set of best practices, but the authoritative technical translation of French law on the matter.[^10] Adherence to this framework is mandatory to ensure that a digital e-prescription can be successfully defended as authentic and integral in a court of law.

The "Force Probante" framework for natively digital documents, such as e-prescriptions, establishes a tiered model of security levels, or "paliers," each offering an increasing degree of legal assurance[^11]:

- **Palier 1 (Simple)**: This is the most basic level, requiring only a unique document identifier, a date, and the signatory's name. It offers minimal security guarantees and is insufficient for documents with legal or medical significance.
- **Palier 2 (Advanced)**: This level requires the use of an advanced electronic signature, typically involving a digital certificate to identify the signer and seal the document's contents. It provides robust guarantees of integrity and authenticity. The validity of a signature at this level can be established through a "convention de preuve" (proof agreement) between the involved parties.[^11] This level corresponds to the "Advanced Electronic Signature" (AdES) defined in the European Union's eIDAS regulation.
- **Palier 3 (Qualified)**: This is the highest level of assurance. It mandates the use of a qualified electronic signature, which must be created using a Qualified Signature Creation Device (QSCD) and based on a qualified certificate. Under French and EU law, a qualified signature holds a "presumption of reliability" and is legally equivalent to a handwritten signature.[^11]

An e-prescription is a document of profound consequence. It authorizes the dispensation of potentially dangerous substances, serves as the legal basis for financial reimbursement by the national health insurance, and forms a critical part of a patient's medical record. Any ambiguity regarding its authenticity or integrity could have severe clinical, financial, and legal repercussions. Consequently, an e-prescription must, at a minimum, meet the requirements of Palier 2 (Advanced). However, to achieve the highest possible legal standing and benefit from the presumption of reliability, systems should be architected to meet Palier 3 (Qualified). This legal imperative directly informs the choice of signature technology, pushing the requirements towards solutions that can support advanced and qualified signatures with provisions for long-term verifiability.

The entire technical architecture of the signature service is therefore dictated by this clear and logical causal chain. The "Ségur" program provides the political and financial impetus for digital transformation.[^1] This transformation requires that digital e-prescriptions have unquestionable legal validity.[^4] French law delegates the definition of this validity to the ANS.[^9] The ANS "Force Probante" framework translates this legal requirement into a concrete, tiered technical model.[^10] The high-stakes nature of an e-prescription places it in the upper tiers of this model, mandating the use of advanced or qualified electronic signatures. This creates a direct and non-negotiable requirement for a signature format that can support these features and ensure their verifiability over long periods, leading inexorably to the PAdES B-LT and B-LTA profiles.

## 2. PAdES Profiles for Long-Term Evidentiary Value

The legal and functional mandates established by the "Force Probante" framework require a technical solution capable of creating robust, self-contained, and long-term verifiable digital signatures. The standard that precisely meets these requirements for PDF documents is PAdES (PDF Advanced Electronic Signatures). This section translates the abstract legal principles into a concrete technical choice, detailing the progressive levels of the PAdES standard and demonstrating why the most advanced profile, PAdES B-LTA, is the necessary and appropriate choice for the French e-prescription system.

### 2.1. Introduction to PAdES (PDF Advanced Electronic Signatures)

PAdES is a set of standards published by the European Telecommunications Standards Institute (ETSI) under the formal designation ETSI EN 319 142.[^14] It does not invent a new signature technology but rather specifies a series of profiles, restrictions, and extensions to the existing digital signature framework within the PDF standard (ISO 32000-1). The primary purpose of PAdES is to ensure that electronic signatures applied to PDF documents are compliant with the European Union's eIDAS (electronic IDentification, Authentication and trust Services) regulation. This compliance makes PAdES signatures legally binding across all EU member states, granting them the status of Advanced Electronic Signatures (AdES) or, when created with the appropriate hardware and certificates, Qualified Electronic Signatures (QES).[^15]

A defining characteristic and significant advantage of the PAdES standard is its principle of self-containment. All the data required to validate the signature—the signature value itself, the signer's certificate, the chain of trust, and information about the certificate's validity at the time of signing—is embedded directly within the PDF file. The signed PDF becomes a single, portable electronic file that carries its own proof of signature, capable of being copied, stored, and distributed without losing its evidentiary value.[^15] This makes it ideal for archiving and for presentation as evidence in legal proceedings.

### 2.2. Foundational Profiles: PAdES B-B and B-T

The PAdES standard defines a series of baseline profiles that build upon one another, each adding a layer of security and reliability. The foundational levels are B-B and B-T.

- **PAdES-B-B (Basic)**: This is the most elementary profile. A PAdES-B-B signature consists of the core digital signature value and the signer's certificate, encapsulated within a standard cryptographic container. It provides a basic level of assurance, proving that the document was signed with the private key corresponding to the public key in the provided certificate.[^18] However, it offers no cryptographically reliable proof of when the signature was applied. The signing time is typically taken from the signer's local computer clock, which is an untrusted source and easily manipulated.
- **PAdES-B-T (Timestamped)**: This profile addresses the timing weakness of the B-B level by incorporating a trusted timestamp. The process involves taking a cryptographic hash of the signature value created at the B-B level and sending this hash to a trusted third party known as a Time Stamping Authority (TSA). The TSA encapsulates this hash with a secure, verifiable timestamp and signs the entire package with its own private key, creating a Time-Stamp Token (TST). This TST is then embedded within the signature structure as an unsigned attribute.[^18] The result is a PAdES-B-T signature, which provides strong, non-repudiable proof that the original signature existed before the date and time indicated in the trusted timestamp. This prevents a signer from later claiming they signed a document at a different time.

### 2.3. Achieving Long-Term Validation (LTV): PAdES B-LT and B-LTA

While a timestamp provides proof of existence in time, it does not solve the fundamental challenge of long-term validation. This challenge, often called the "LTV problem," is a critical consideration for documents with legal retention periods that span many years or decades, such as medical records.

The LTV problem arises because a digital signature's validity is intrinsically linked to the validity of the signer's certificate and every other certificate in its chain of trust. A verifier must be able to confirm that, at the moment of signing (or timestamping), the signer's certificate was not expired, had not been revoked, and was issued by a legitimate chain of Certificate Authorities (CAs) leading to a trusted root. This requires access to external validation services, such as Certificate Revocation Lists (CRLs) or Online Certificate Status Protocol (OCSP) responders. Over time, these services may become unavailable, CAs may cease operations, or the cryptographic algorithms used to sign the certificates may become weak. When this happens, a signature that was perfectly valid at the time of creation can no longer be verified, and its evidentiary value is lost.21

The PAdES standard provides two advanced profiles specifically designed to solve the LTV problem.

- **PAdES-B-LT (Long Term)**: This profile achieves long-term validation by embedding all the necessary validation materials into the PDF file itself at the time of signing. This information is stored in a dedicated PDF object known as the Document Security Store (DSS).[^22] The DSS acts as a local archive of validation evidence, containing:

- The complete chain of certificates, from the signer's end-entity certificate up to the trusted root CA certificate.[^19]
- The certificate revocation information (either complete CRLs or specific OCSP responses) for every single certificate in the chain.[^19]

By including this comprehensive set of validation data, the PAdES-B-LT signature becomes self-sufficient. A verifier, even decades in the future, can validate the signature's authenticity at the time of signing by using only the information contained within the PDF file, without any need to contact external, potentially defunct, online services.[^15]

- **PAdES-B-LTA (Long Term with Archive Timestamp)**: This profile represents the highest level of assurance and is considered the gold standard for long-term archival of legally critical documents. It builds upon the B-LT profile by adding one final, crucial element: a Document Timestamp. After the signature has been created and all the validation data has been added to the DSS, a timestamp is applied to a hash of the entire PDF file as it exists at that moment. This timestamp, which is also embedded in the document, effectively creates a cryptographic seal over the signature and its associated validation data.[^18] This protects the integrity of the validation material itself. It mitigates the risk of a future attacker compromising a CA key and using it to forge back-dated revocation information that could then be used to challenge the validity of the original data in the DSS. The PAdES-B-LTA profile provides a periodically renewable chain of trust that ensures the document's integrity and verifiability indefinitely.[^24]

The selection of the PAdES B-LTA profile is the only logical conclusion when synthesizing the requirements of the "Force Probante" framework with the technical capabilities of the PAdES standard. The "Force Probante" framework demands that digital health documents remain verifiable for their entire legal retention period, which can extend for decades.[^25] Standard digital signatures, like PAdES B-B, fail this long-term requirement because their validity is tied to the ephemeral state of external CAs and revocation services.[^21] The PAdES B-LT profile is explicitly designed to solve this by embedding all necessary validation data, directly addressing the long-term conservation principle of "Force Probante".[^19]

Furthermore, the "Force Probante" framework emphasizes the concept of a "dossier de preuve" (proof file), which must be a complete and tamper-evident record of the signature event.[^11] The validation data stored within the DSS is a critical part of this proof file. The PAdES B-LTA profile enhances this by adding a Document Timestamp that cryptographically seals the DSS itself, protecting the integrity of the validation data over time.[^18] This provides a superior level of assurance that aligns perfectly with the "dossier de preuve" concept. Therefore, to create an e-prescription with the highest possible evidentiary value that will withstand future legal scrutiny, the PAdES B-LTA profile is the mandatory technical choice.

|         |                         |                                  |                                    |                               |
| ------- | ----------------------- | -------------------------------- | ---------------------------------- | ----------------------------- |
| Profile | Core Signature          | Timestamp                        | Validation Data (DSS)              | Archive Timestamp             |
| B-B     | Signature + Certificate | No                               | No                                 | No                            |
| B-T     | Signature + Certificate | Yes (TSA Timestamp on Signature) | No                                 | No                            |
| B-LT    | Signature + Certificate | Yes (TSA Timestamp on Signature) | Yes (Full Cert Chain + CRLs/OCSPs) | No                            |
| B-LTA   | Signature + Certificate | Yes (TSA Timestamp on Signature) | Yes (Full Cert Chain + CRLs/OCSPs) | Yes (Timestamp on entire PDF) |

## 3. The Anatomy of the PAdES Cryptographic Container

At the heart of every PAdES signature is a precisely structured cryptographic object known as a CMS (Cryptographic Message Syntax) container. This container, defined by the Internet Engineering Task Force (IETF) in RFC 5652, serves as a standardized envelope for the signature value and all its associated metadata. Understanding the internal structure of this container, particularly the mandatory and prohibited attributes specified by the PAdES standard, is fundamental to creating a compliant signature. The design of this structure reveals a sophisticated security model based on cryptographic indirection, ensuring that critical metadata is bound to the signature just as strongly as the document content itself.

### 3.1. The CMS SignedData Structure (IETF RFC 5652)

PAdES signatures are formally encapsulated within a CMS SignedData structure.[^27] This structure is defined using Abstract Syntax Notation One (ASN.1), a formal language for describing data structures, and is typically encoded for transmission or storage using the Distinguished Encoding Rules (DER), which produce a compact, unambiguous binary representation.[^29]

The SignedData structure is a composite object containing several key fields:

- `version`: An integer specifying the version of the CMS syntax.
- `digestAlgorithms`: A set of Object Identifiers (OIDs) that declare the hashing algorithms used by the various signers (e.g., SHA-256).
- `encapContentInfo`: An EncapsulatedContentInfo structure that contains the actual data being signed. For PAdES, the signature is always "detached," meaning this structure does not contain the PDF content itself but simply declares its type.
- `certificates`: An optional set containing the X.509 certificates needed to validate the signature(s). At a minimum, this includes the signer's certificate.[^30]
- `crls`: An optional set containing Certificate Revocation Lists (CRLs) relevant to the certificates.
- `signerInfos`: A set of SignerInfo structures. There is one SignerInfo structure for each signature applied to the data.[^30] This is the most critical component for the PAdES implementation.

### 3.2. The SignerInfo Block and PAdES-Specific Signed Attributes

The SignerInfo structure contains all the information specific to a single signer. This includes an identifier for the signer's certificate, the signature algorithm used, the resulting signature value, and, most importantly, a collection of signed attributes.[^32]

A crucial aspect of the CMS security model is that the digital signature is not calculated directly over the hash of the document content. Instead, the signature is calculated over the canonical DER-encoded representation of the `signedAttributes` block. This design inextricably binds these attributes to the signature. One of these signed attributes, `message-digest`, contains the hash of the actual document content. This layer of indirection allows for essential metadata to be included under the protection of the signature, creating a much more robust and secure assertion than a simple "raw" signature.

For a signature to be compliant with the PAdES Baseline profiles, the `signedAttributes` block must contain a specific set of attributes and must not contain others.

**Mandatory Signed Attributes for PAdES Baseline Compliance:**

- **content-type** (OID: `1.2.840.113549.1.9.3`): This attribute must be present, and its value must be the OID for `id-data` (`1.2.840.113549.1.7.1`). This signals that the signature is being applied to external data content, which in this case is the byte range of the PDF document.[^34]
- **message-digest** (OID: `1.2.840.113549.1.9.4`): This attribute contains the octet string of the digest (hash) calculated over the specified byte range of the PDF document. This is the fundamental link that binds the cryptographic signature within the CMS container to the actual content of the document being signed.[^35]
- **signing-certificate-v2** (OID: `1.2.840.113549.1.9.16.2.47`): This attribute provides a secure, unambiguous reference to the certificate that the signer claims to have used for signing. It contains a hash of the signer's full certificate, calculated using a specified algorithm (e.g., SHA-256). This attribute is mandated by modern standards over the older `signing-certificate` attribute because it prevents potential certificate substitution attacks and is not tied to the now-insecure SHA-1 algorithm.[^17]

**Prohibited Signed Attribute for PAdES Baseline Compliance:**

- **signing-time** (OID: `1.2.840.113549.1.9.5`): The PAdES Baseline standard explicitly forbids the inclusion of the `signing-time` attribute within the set of signed attributes.[^39] This is a deliberate and important security consideration. The value for this attribute would be sourced from the signer's local system clock, which is an untrusted and easily forgeable source of time. Cryptographically signing this untrusted value would give it a false aura of authenticity. The PAdES standard correctly relegates the untrusted signing time to a different part of the PDF structure (the `/M` key in the Signature Dictionary), while relying on trusted third-party timestamps for verifiable proof of time.[^41]

| Attribute Name           | OID                          | Type     | PAdES Baseline Status       | Purpose                                                                                                                            |
| ------------------------ | ---------------------------- | -------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `content-type`           | `1.2.840.113549.1.9.3`       | Signed   | Mandatory                   | Declares the type of the signed content as external data (`id-data`).                                                              |
| `message-digest`         | `1.2.840.113549.1.9.4`       | Signed   | Mandatory                   | Contains the hash of the PDF document's byte range, linking the signature to the content.                                          |
| `signing-certificate-v2` | `1.2.840.113549.1.9.16.2.47` | Signed   | Mandatory                   | A signed hash of the signer's certificate to prevent substitution attacks and unambiguously link the signature to the certificate. |
| `signing-time`           | `1.2.840.113549.1.9.5`       | Signed   | Forbidden                   | Intended to hold the signer's local system time; forbidden because this is an untrusted value.                                     |
| `signature-time-stamp`   | `1.2.840.113549.1.9.16.2.14` | Unsigned | Mandatory for B-T and above | Contains a Time-Stamp Token from a trusted TSA, providing verifiable proof of the signature's existence time.                      |

### 3.3. Unsigned Attributes: The Role of the Timestamp Token

In addition to signed attributes, the SignerInfo structure can also contain unsigned attributes. These are added to the structure after the signature has been computed and are therefore not covered by the signature value itself.

The most important unsigned attribute in the context of PAdES is the `signature-time-stamp` (OID: `1.2.840.113549.1.9.16.2.14`).[^38] This attribute serves as the container for the Time-Stamp Token (TST) obtained from a TSA, as defined in IETF RFC 3161. The TST is itself a SignedData structure. It contains a hash of the original signature value (from the `signature` field of the SignerInfo block), a secure timestamp from the TSA, and the TSA's signature over that data.[^42]

The inclusion of this `signature-time-stamp` unsigned attribute is precisely what elevates a PAdES-B-B signature to a PAdES-B-T signature. It provides the strong, verifiable proof of the signature's existence at a specific point in time that is essential for legal non-repudiation.

The layered design of the CMS container reflects a sophisticated, security-first approach. A naive implementation might simply sign the document hash. However, this would fail to securely bind critical metadata to the signature. The `signedAttributes` mechanism solves this by making the signature an assertion over a collection of metadata (`content-type`, `signing-certificate-v2`, etc.) that includes the document hash (`message-digest`).[^32] Any alteration to the document content (which would change the `message-digest`) or any attempt to substitute the intended signing certificate (which would change the `signing-certificate-v2` hash) will cause the signature verification to fail. This creates a much stronger cryptographic binding. The deliberate prohibition of the `signing-time` attribute exemplifies this philosophy: only data that can be trusted should be cryptographically signed.[^39] Untrusted data, like the local system time, is handled by separate, non-cryptographic mechanisms within the PDF structure itself. Trusted, but post-signature, data, such as a TSA timestamp, is handled via the separate mechanism of unsigned attributes. This demonstrates a deep and deliberate security architecture.

## 4. Embedding the Signature into the PDF Structure

Creating a valid PAdES signature involves more than just constructing a compliant CMS cryptographic container; this container must be correctly embedded within the complex structure of a PDF file. This process requires the precise creation and manipulation of several specific PDF objects. An error in this stage, such as an incorrect dictionary key or a miscalculated byte offset, will render the signature invalid, regardless of the cryptographic correctness of the CMS object itself. The most critical and fragile aspect of this process is the calculation of the signature's ByteRange and the subsequent use of incremental updates to preserve its validity, a requirement that places significant demands on the capabilities of the PDF manipulation library used.

### 4.1. The PDF Signature Dictionary and AcroForm Field

In the PDF specification, a digital signature is not a standalone object but is implemented as a type of interactive form field.[^45] The proper embedding of a signature therefore requires the presence of an AcroForm structure within the document.

[^1]: **Document Catalog and AcroForm Dictionary**: The root of the PDF's object hierarchy, the Document Catalog, must contain an `/AcroForm` key. The value of this key is the Interactive Form Dictionary, which serves as the root for all form fields in the document.[^47] This dictionary's `/Fields` key must contain an array of indirect references to all the root-level form fields, including the new signature field. Additionally, its `/SigFlags` entry should be set to the integer 3. This value is a bitfield where bit 1 (SignaturesExist) indicates that the document contains at least one signature, and bit 2 (AppendOnly) indicates that the document contains signatures that may be invalidated if the file is saved in any way other than an incremental update.[^49]

[^2]: **Signature Field and Widget Annotation**: The signature itself is represented by a field dictionary where the `/FT` (Field Type) key has the value `/Sig`. This field dictionary is typically merged with its visual representation, a widget annotation, which has `/Type` set to `/Annot` and `/Subtype` set to `/Widget`.[^46] This annotation defines the signature's location and appearance on the page.

[^3]: **The Signature Dictionary**: The most important key within the signature field's dictionary is `/V` (Value), which contains an indirect reference to the Signature Dictionary. This dictionary, identified by `/Type` `/Sig`, holds the actual signature data and metadata.[^51] The correct population of this dictionary is essential for PAdES compliance.

| Key            | Type        | PAdES Requirement | Description                                                                                                                                                                      |
| -------------- | ----------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/Type`        | Name        | Mandatory         | Must be `/Sig` to identify this as a signature dictionary.                                                                                                                       |
| `/Filter`      | Name        | Mandatory         | Specifies the signature handler. The standard value is `/Adobe.PPKLite`.                                                                                                         |
| `/SubFilter`   | Name        | Mandatory         | Specifies the signature encoding. For PAdES Baseline, this MUST be `/ETSI.CAdES.detached` to indicate a detached CMS signature container compliant with the CAdES standard.[^34] |
| `/ByteRange`   | Array       | Mandatory         | An array of four integers defining the exact byte ranges of the file that are covered by the signature hash. This is crucial for integrity validation.[^51]                      |
| `/Contents`    | String      | Mandatory         | A hexadecimal string containing the DER-encoded CMS SignedData object (the signature container from Section 3).[^51]                                                             |
| `/M`           | Date String | Mandatory         | The (untrusted) modification date, representing the claimed time of signing from the signer's system clock. PAdES Baseline requires this key to be present.[^39]                 |
| `/Reason`      | Text String | Optional          | A human-readable text string specifying the reason for signing (e.g., "I am the author of this document").                                                                       |
| `/Location`    | Text String | Optional          | A human-readable text string specifying the location of signing (e.g., "Paris, France").                                                                                         |
| `/ContactInfo` | Text String | Optional          | A human-readable text string providing contact information for the signer (e.g., an email address).                                                                              |

### 4.2. The Incremental Signing Process and ByteRange Calculation

The integrity of a PDF digital signature hinges on the `/ByteRange` entry. This array defines precisely which parts of the file were hashed to produce the `message-digest` attribute in the CMS container. Any modification to these bytes after signing, no matter how small, will cause the hash to mismatch and the signature to be invalidated. This leads to a fundamental rule of PDF signing: to preserve the validity of an existing signature, new data (such as a second signature or LTV information) can only be added to the file through an incremental update. An incremental update appends changes to the end of the file without altering any of the preceding bytes.[^45]

The process of applying a signature is a multi-step procedure that must be executed in a precise order:

1. **Preparation and Placeholder Reservation**: The PDF document is parsed. The necessary AcroForm objects and a new signature field are added. Within the Signature Dictionary, a placeholder is created for the `/Contents` value. This placeholder is typically a long string of zero bytes, enclosed in angle brackets (e.g., `<0000...0000>`). It is critical that this placeholder is larger than the final CMS signature container will be.[^56] The document is then saved to a memory buffer.

2. **ByteRange Definition**: With the prepared buffer, the `/ByteRange` array can now be calculated. It consists of four integers: `[start_1, length_1, start_2, length_2]`.

- `start_1` is always 0. `length_1` is the byte offset of the `<` character that begins the `/Contents` placeholder.
- `start_2` is the byte offset of the `>` character that ends the `/Contents` placeholder, plus one.
- `length_2` is the number of bytes from the position defined by `start_2` to the very end of the file buffer.

This definition effectively selects the entire file for hashing, with the crucial exception of the placeholder reserved for the signature itself.[^51]

3. **Hashing**: The two byte ranges of the file buffer (from offset 0 for `length_1` bytes, and from offset `start_2` for `length_2` bytes) are concatenated in order. A cryptographic hash (e.g., SHA-256) is then computed on this concatenated data.

4. **CMS Creation and Signing**: The hash computed in the previous step is embedded into the `message-digest` signed attribute of a SignerInfo structure. The full CMS SignedData object is then constructed and signed by the signing device (e.g., a smart card), as detailed in Section 3.

5. **Signature Injection**: The resulting DER-encoded CMS object is converted into a hexadecimal string. This hexadecimal string then replaces the string of zeroes within the `/Contents` placeholder in the PDF buffer. It is imperative that the final hexadecimal string is not longer than the original placeholder; if it is, the byte offsets will change, and the signature will be invalid.

6. **Finalization**: The modified buffer, now containing the complete and valid signature, constitutes the signed PDF file. For any subsequent operations, such as adding a second signature or embedding LTV data (CRLs/OCSPs) into a DSS dictionary, the entire process must be repeated on the already-signed file, and the new objects must be saved as an incremental update.

This intricate process highlights a critical dependency. The ability to perform a true incremental save is not an optional feature for a PDF library; it is a fundamental prerequisite for creating PAdES-compliant signatures, especially those requiring multiple signatures or LTV enablement. Standard libraries, including the popular `pdf-lib`, do not support incremental saving and instead rewrite the entire file upon saving, which collapses all previous revisions and invalidates existing signatures.[^57] This makes them unsuitable for this use case without modification or the use of specialized forks that add this capability. The choice of PDF library is therefore a critical path decision for the project's success.

### 4.3. Best Practices for Visual Signature Appearance

While the cryptographic proof of a signature resides in the invisible data structures within the PDF, providing a visual representation on the page is crucial for user experience and trust.[^21] This is achieved using a PDF Appearance Stream, a self-contained set of drawing instructions associated with the signature's widget annotation.[^46]

The following best practices should be observed when designing a visual signature appearance:

- **Informative Content**: The appearance should clearly and legibly display key information to the user. This typically includes the signer's name as extracted from the certificate's subject, the date and time of signing (from the `/M` key or a trusted timestamp), and the reason for signing if provided in the `/Reason` key.[^17]
- **Graphical Elements**: A graphic, such as a scanned image of a handwritten signature or an official organizational logo, can be included to enhance recognition and professionalism. For best results, graphics should have transparent backgrounds to avoid obscuring document content.[^58]
- **Clarity of Purpose**: It is vital that the visual representation does not mislead the user into thinking it is the signature. The design should make it clear that it is a representation, and users should be educated to rely on the validation status provided by the PDF reader's dedicated signature panel (e.g., the "blue ribbon" in Adobe Acrobat) for the true verification result.[^17]
- **Archival Compliance (PDF/A)**: If the signed document must also comply with the PDF/A standard for long-term archiving, all fonts used within the appearance stream must be embedded in the PDF file. This ensures that the visual representation can be rendered identically in the future, even if the original fonts are no longer available on the viewing system.[^58]

## 5. Implementation Blueprint: A Node.js Signature Service

This section provides a practical architectural and implementation blueprint for building the PAdES-compliant signature service. It proposes a specific, robust technology stack for a Node.js environment and offers a detailed walkthrough of the critical code paths, from interfacing with the healthcare professional's smart card to assembling the final, signed PDF document.

### 5.1. System Architecture and Core Libraries

A service-oriented architecture using Node.js is well-suited for this task, leveraging its asynchronous I/O model for efficient handling of file operations and cryptographic requests. The recommended technology stack is chosen specifically to address the unique challenges of PAdES signing identified in the previous sections.

- **Runtime Environment**: Node.js. Its event-driven, non-blocking architecture is ideal for building scalable services that handle I/O-bound tasks like file processing and communication with hardware security modules. Its vast ecosystem of packages provides access to necessary libraries.
- **PDF Manipulation**: `pdf-lib` combined with the `pdf-lib-incremental-save` fork.[^60] The standard `pdf-lib` library provides a powerful and intuitive API for parsing and manipulating PDF object structures in memory.[^61] However, as established, its lack of an incremental save feature is a critical limitation for PAdES LTV workflows.[^57] The `pdf-lib-incremental-save` fork specifically adds this missing capability, making the combination a viable and effective tool for this project.
- **Cryptographic Operations**: PKI.js.[^63] This is a comprehensive, modern TypeScript/JavaScript library for handling Public Key Infrastructure (PKI) data structures. It provides robust, standards-compliant implementations for parsing and creating X.509 certificates and, most importantly, for constructing the complex ASN.1 structures required for CMS (RFC 5652).[^63] It is built upon the Web Crypto API, which delegates the underlying cryptographic primitives to the highly optimized and vetted implementations within the Node.js runtime or browser. Its strong focus on the specific IETF and ETSI standards required for this project makes it a superior choice over more general-purpose crypto libraries like `jsrsasign`.[^64]
- **HSM/Smart Card Interaction**: A PKCS#11 library for Node.js, such as `pkcs11js`. This library provides the necessary JavaScript bindings to a native PKCS#11 module (e.g., OpenSC), allowing the Node.js application to communicate directly with the healthcare professional's smart card using the standard PKCS#11 API.

### 5.2. Interfacing with the CPS Card via PKCS#11

The French "Carte de Professionnel de Santé" (CPS) is a smart card that functions as a Secure Signature-Creation Device (SSCD) and, when used with a qualified certificate, a Qualified Signature Creation Device (QSCD).[^65] The critical security principle of such a device is that the private signing key is generated on the card and is physically and logically prevented from ever leaving it. All signing operations are performed by the processor on the card itself.

The standard, vendor-neutral API for communicating with such cryptographic hardware is PKCS#11.[^66] The signature service will use a library like `pkcs11js` to perform the following sequence of operations:

[^1]: Initialize the PKCS#11 library.

[^2]: Discover the available slots (i.e., card readers).

[^3]: Open a session with the slot containing the CPS card.

[^4]: Prompt the user for their PIN and perform a login to the card (`C_Login`).

[^5]: Search for the specific private key object on the card designated for digital signatures (`C_FindObjects`).

[^6]: Initiate and execute the signing operation (`C_Sign`).

A critical security consideration in this process is the choice of the signing mechanism. The PKCS#11 standard defines two main paradigms for signature generation:

- **"Raw" Signing**: Mechanisms like `CKM_RSA_PKCS` expect the application to perform the hashing and the security-critical padding (e.g., PKCS#1 v1.5 padding) and then send the padded block to the card for the raw RSA private key operation. This is dangerous because it offloads a core security function to the less-secure client application and can be vulnerable to misuse or implementation errors.[^68]
- **"Hash-and-Sign"**: Mechanisms like `CKM_SHA256_RSA_PKCS` are far more secure and are the recommended approach.[^67] With this mechanism, the application computes the hash of the data to be signed and sends only this hash to the card. The card's firmware is then responsible for correctly applying the standard PKCS#1 v1.5 padding before performing the RSA signature operation. This ensures that the security-critical padding step is performed within the trusted environment of the smart card, significantly reducing the attack surface.

Therefore, the implementation must use a "hash-and-sign" mechanism like `CKM_SHA256_RSA_PKCS` to ensure the integrity and security of the signing process.

### 5.3. Implementation Walkthrough (Annotated Code Examples)

The following pseudocode and annotated examples illustrate the end-to-end signing workflow, integrating the recommended libraries.

#### Step 1: Preparing the PDF with pdf-lib and pdf-lib-incremental-save

This step involves loading the original e-prescription PDF, adding the necessary signature field and dictionary objects, and reserving a placeholder for the signature contents.

```javascript
// Import necessary classes from the pdf-lib fork
import { PDFDocument, PDFName, PDFString, PDFHexString } from "pdf-lib-incremental-save";
import fs from "fs";

// Load the original e-prescription PDF
const pdfBuffer = fs.readFileSync("prescription.pdf");
const pdfDoc = await PDFDocument.load(pdfBuffer);

// Add a signature field to the AcroForm
const acroForm = pdfDoc.context.lookup(pdfDoc.catalog.get(PDFName.of("AcroForm")));
const signatureField = pdfDoc.context.obj({
  FT: "Sig",
  Type: "Annot",
  Subtype: "Widget",
  T: PDFString.of("Signature Prescripteur"),
  F: 132, // Set appropriate field flags (e.g., Print, ReadOnly)
  Rect: [0, 0, 0, 0], // Invisible signature
  P: pdfDoc.getPage(0).ref, // Reference to the page
});
const signatureFieldRef = pdfDoc.context.register(signatureField);

// Add the field to the AcroForm's Fields array
const fields = acroForm.get(PDFName.of("Fields"));
fields.push(signatureFieldRef);

// Create the Signature Dictionary with a large placeholder
const signatureDict = pdfDoc.context.obj({
  Type: "Sig",
  Filter: "Adobe.PPKLite",
  SubFilter: "ETSI.CAdES.detached",
  // Reserve a large enough placeholder for the CMS container
  Contents: PDFHexString.of("0".repeat(8192)),
  ByteRange: [0, 0, 0, 0], // Placeholder, will be calculated later
  M: PDFString.fromDate(new Date()),
});
const signatureDictRef = pdfDoc.context.register(signatureDict);

// Link the signature dictionary to the field
signatureField.set(PDFName.of("V"), signatureDictRef);

// Save the prepared document to a buffer to get the byte layout for hashing
// This is a crucial step before the actual signing.
const pdfToSign = await pdfDoc.save({ useObjectStreams: false });

// The 'pdfToSign' buffer is now ready for the ByteRange calculation and hashing.
```

#### Step 2: Constructing the CMS Container with PKI.js

This step involves creating the SignedData structure and preparing the signedAttributes that will be hashed and sent to the smart card.

```javascript
import * as pkijs from "pkijs";
import * as asn1js from "asn1js";

// Assume 'signerCert' is a PKI.js Certificate object loaded from the CPS card
// Assume 'documentHash' is a Uint8Array containing the SHA-256 hash of the pdfToSign buffer's ByteRange

// 1. Create the SignedData structure
const signedData = new pkijs.SignedData({
  version: 1,
  encapContentInfo: new pkijs.EncapsulatedContentInfo({
    eContentType: "1.2.840.113549.1.7.1", // id-data
  }),
  signerInfos: [],
  certificates: [signerCert],
});

// 2. Create the Signed Attributes
const signedAttrs = new pkijs.SignedAttributes({
  attributes: [
    new pkijs.Attribute({
      type: "1.2.840.113549.1.9.3", // content-type
      values: [new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" })], // id-data
    }),
    new pkijs.Attribute({
      type: "1.2.840.113549.1.9.4", // message-digest
      values: [new asn1js.OctetString({ valueHex: documentHash })],
    }),
    new pkijs.Attribute({
      type: "1.2.840.113549.1.9.16.2.47", // signing-certificate-v2
      values: [
        new pkijs.SigningCertificateV2({
          certs: [
            {
              hashAlgorithm: { algorithmId: "2.16.840.1.101.3.4.2.1" },
              certHash: new Uint8Array(32),
            },
          ],
        }),
      ],
    }),
  ],
});

// 3. Add attributes to the SignerInfo
signedData.signerInfos[0].signedAttrs = signedAttrs;

// 4. Serialize the signedAttributes for signing. THIS is the data that gets sent to the HSM.
const dataToSign = signedAttrs.toSchema().toBER(false);
```

#### Step 3: Generating the Signature via PKCS#11

This step shows the interaction with the smart card to sign the hash of the signedAttributes.

```javascript
import { PKCS11 } from "pkcs11js";

const pkcs11 = new PKCS11();
pkcs11.load("/usr/lib/opensc-pkcs11.so"); // Path to the PKCS#11 module
pkcs11.C_Initialize();

const slots = pkcs11.C_GetSlotList(true);
const slot = slots[0];
const session = pkcs11.C_OpenSession(slot, PKCS11.CKF_SERIAL_SESSION | PKCS11.CKF_RW_SESSION);

// Prompt user for PIN
pkcs11.C_Login(session, PKCS11.CKU_USER, "USER_PIN");

// Find the private key for signing
const privateKey = pkcs11.C_FindObjects(session, [
  { type: PKCS11.CKA_CLASS, value: PKCS11.CKO_PRIVATE_KEY },
  { type: PKCS11.CKA_KEY_TYPE, value: PKCS11.CKK_RSA },
])[0];

// Define the secure "hash-and-sign" mechanism
const mechanism = { mechanism: PKCS11.CKM_SHA256_RSA_PKCS, parameter: null };

// Initiate the signing operation
pkcs11.C_SignInit(session, mechanism, privateKey);

// Sign the DER-encoded signedAttributes from Step 2
const signatureValue = pkcs11.C_Sign(session, Buffer.from(dataToSign));

pkcs11.C_Logout(session);
pkcs11.C_CloseSession(session);
pkcs11.C_Finalize();
```

#### Step 4: Assembling the Final Signed PDF

The final step is to take the signature value from the HSM, complete the CMS container, and inject it back into the PDF using an incremental save.

```javascript
// 1. Add the signature value to the PKI.js SignerInfo object
signedData.signerInfos[0].signature = new asn1js.OctetString({ valueHex: signatureValue });

// 2. Create the final ContentInfo structure containing the SignedData
const cmsContent = new pkijs.ContentInfo({
  contentType: "1.2.840.113549.1.7.2", // signedData
  content: signedData.toSchema(),
});

// 3. DER-encode the final CMS container
const finalCMS = cmsContent.toSchema().toBER(false);

// 4. Inject the signature into the PDF
// This requires a function that can find the ByteRange placeholder and replace it.
const finalPdfBytes = injectSignature(pdfToSign, finalCMS);

// The 'injectSignature' function would:
// - Find the ByteRange array in the buffer.
// - Find the Contents placeholder.
// - Replace the placeholder with the hex-encoded 'finalCMS'.
// - Update the ByteRange array with the correct final offsets and lengths.
// - Return the modified buffer.

// Save the final signed document
fs.writeFileSync("prescription_signed.pdf", finalPdfBytes);
```

This blueprint provides a complete, secure, and standards-compliant pathway for implementing the e-prescription signature service. The careful selection of libraries and adherence to the secure "hash-and-sign" paradigm ensures that the resulting system will meet the stringent requirements of the French healthcare ecosystem.

## 6. Conclusion and Strategic Recommendations

The implementation of a digital signature service for the French "Ordonnance Numérique" is a complex undertaking that lies at the intersection of national healthcare policy, European legal frameworks, and deep cryptographic principles. A successful implementation requires more than just technical proficiency; it demands a thorough understanding of the entire regulatory and security chain that dictates the system's architecture. The choices made are not arbitrary but are the direct consequence of a legal mandate to ensure the long-term evidentiary value—the "force probante"—of every e-prescription.

### Summary of Requirements

The technical requirements for the signature service can be traced through a clear, hierarchical logic:

[^1]: **Policy Mandate**: The "Ségur du numérique en santé" program mandates the modernization and secure sharing of health data, with the dematerialized e-prescription as a central component.

[^2]: **Legal Imperative**: French law, via the Public Health Code, requires that these digital documents possess "force probante." It delegates the technical specifications for achieving this to the Agence du Numérique en Santé (ANS).

[^3]: **Technical Doctrine**: The ANS "Référentiel Force Probante" translates this legal need into a tiered model of security levels ("paliers"). The critical nature of an e-prescription places it at the highest tiers, requiring at least an Advanced (Palier 2) and ideally a Qualified (Palier 3) electronic signature.

[^4]: **Standards-Based Implementation**: The PAdES standard (ETSI EN 319 142) provides the definitive, eIDAS-compliant technical implementation for creating such signatures within PDF documents. The specific need for verifiability over long archival periods makes the PAdES B-LTA profile the only truly sufficient choice, as it embeds all necessary validation data and protects it with an archive timestamp.

### Key Architectural Recommendations

Based on the detailed analysis in this guide, the following architectural principles should be considered non-negotiable for any service aiming for full compliance and long-term viability:

- **Mandate PAdES B-LTA**: The service must be designed to produce signatures conforming to the PAdES B-LTA profile. Settling for lesser profiles (B-B, B-T, or even B-LT) introduces unacceptable risks regarding the long-term legal defensibility of the e-prescriptions. The clinical, financial, and legal context demands the highest level of assurance that only B-LTA can provide.
- **Prioritize Incremental Save Capability**: The PDF manipulation library is a critical architectural component. Its ability to perform true incremental updates is an absolute prerequisite for generating compliant PAdES B-LT and B-LTA signatures. A library that rewrites the entire file on save will invalidate previously applied signatures and is fundamentally incompatible with multi-signature or long-term validation workflows. This technical capability must be a primary criterion in technology selection.
- **Enforce Secure HSM Interaction**: All cryptographic operations involving the private key must be performed on a secure hardware device, such as the CPS smart card. The interaction with this device via the PKCS#11 API must strictly adhere to the "hash-and-sign" paradigm (e.g., using the `CKM_SHA256_RSA_PKCS` mechanism). This confines the security-critical padding operation to the trusted hardware environment and minimizes the application's attack surface.

### Operational Best Practices

Beyond the core architecture, the ongoing operation and maintenance of the signature service require adherence to best practices that ensure continued compliance and legal robustness.

- **Use Qualified Trust Services**: The integrity of a PAdES B-LTA signature relies on external trust services. For Time Stamping Authorities (TSAs) and the Certificate Authorities (CAs) that issue signing certificates, the service must exclusively use providers that are listed on the European Union Trusted Lists (EUTL). Using eIDAS-qualified trust service providers ensures maximum legal recognition and interoperability across the EU.
- **Maintain the "Dossier de Preuve"**: The "Force Probante" framework places significant emphasis on the concept of a "dossier de preuve," or proof file.[^11] For every signature transaction, the service must generate and securely archive a comprehensive audit package. This package should contain, at a minimum: the original unsigned document, the final signed document, copies of all certificates used in the validation path, the specific revocation responses (CRLs/OCSPs) retrieved, and detailed, timestamped logs of every step in the signature creation process. This dossier is the ultimate record that demonstrates the signature was created in a compliant manner and must be retained for at least as long as the e-prescription itself.
- **Plan for Cryptographic Agility**: The field of cryptography is not static. Algorithms that are considered secure today may be deprecated in the future. The system's design should anticipate this by abstracting cryptographic functions (e.g., hash algorithms, signature schemes) in a way that allows them to be updated as new standards are mandated by regulatory bodies like the French National Agency for the Security of Information Systems (ANSSI). This "cryptographic agility" is essential for the long-term security and compliance of the service.

By adhering to these architectural and operational principles, developers can construct a PAdES-compliant digital signature service that not only meets the immediate technical requirements of the "Ordonnance Numérique" but also provides the enduring legal and cryptographic integrity demanded by the French healthcare system.

#### Sources des citations

[^1]: Le Ségur du numérique en santé - GRADeS Corse e-santé, consulté le août 19, 2025, [https://corse-esante.fr/projet/le-segur-du-numerique-en-sante/](https://www.google.com/url?q=https://corse-esante.fr/projet/le-segur-du-numerique-en-sante/&sa=D&source=editors&ust=1756491753654825&usg=AOvVaw2JMA-7Ljhwm-89BhGBnISJ)

[^2]: Lancement opérationnel du volet numérique du Ségur de la santé : 2 milliards d'euros pour généraliser le partage des données de santé, consulté le août 19, 2025, [https://sante.gouv.fr/archives/archives-presse/archives-communiques-de-presse/article/lancement-operationnel-du-volet-numerique-du-segur-de-la-sante](https://www.google.com/url?q=https://sante.gouv.fr/archives/archives-presse/archives-communiques-de-presse/article/lancement-operationnel-du-volet-numerique-du-segur-de-la-sante&sa=D&source=editors&ust=1756491753655781&usg=AOvVaw0vjEhoFlG9Mwf6pCQPL6D5)

[^3]: Ségur Usage Numérique en Établissements de Santé - Ministère du Travail, de la Santé, des Solidarités et des Familles, consulté le août 19, 2025, [https://sante.gouv.fr/systeme-de-sante/segur-de-la-sante/sun-es](https://www.google.com/url?q=https://sante.gouv.fr/systeme-de-sante/segur-de-la-sante/sun-es&sa=D&source=editors&ust=1756491753656475&usg=AOvVaw2IM9c5zGQriP6rLFW8hl2b)

[^4]: Ordonnance numérique - G_NIUS, consulté le août 19, 2025, [https://gnius.esante.gouv.fr/fr/reglementation/fiches-reglementation/ordonnance-numerique](https://www.google.com/url?q=https://gnius.esante.gouv.fr/fr/reglementation/fiches-reglementation/ordonnance-numerique&sa=D&source=editors&ust=1756491753657061&usg=AOvVaw0lr1oMPsla_fMw5c-QCKlM)

[^5]: Ordonnance Numérique - Area Santé, consulté le août 19, 2025, [https://www.areasante.fr/fr/normes-reglementation/ordonnance-numerique](https://www.google.com/url?q=https://www.areasante.fr/fr/normes-reglementation/ordonnance-numerique&sa=D&source=editors&ust=1756491753657547&usg=AOvVaw36g7mq417NK9opTG_RGR9I)

[^6]: le ségur numérique, mon espace sante et les outils du numerique en sante - OMéDIT PACA-Corse, consulté le août 19, 2025, [https://www.omeditpacacorse.fr/wp-content/uploads/2023/02/Presentation-Mon-Espace-Sante-Segur-070223.pdf](https://www.google.com/url?q=https://www.omeditpacacorse.fr/wp-content/uploads/2023/02/Presentation-Mon-Espace-Sante-Segur-070223.pdf&sa=D&source=editors&ust=1756491753658142&usg=AOvVaw14PsURG9NnEfStCLC20ONg)

[^7]: Ordonnance numérique : un service qui facilite les échanges et le suivi des patients - Ameli, consulté le août 19, 2025, [https://www.ameli.fr/pharmacien/exercice-professionnel/delivrance-produits-sante/regles-delivrance-prise-charge/ordonnance-numerique](https://www.google.com/url?q=https://www.ameli.fr/pharmacien/exercice-professionnel/delivrance-produits-sante/regles-delivrance-prise-charge/ordonnance-numerique&sa=D&source=editors&ust=1756491753658788&usg=AOvVaw2qoDUzKpp-QxAmqSlAomIQ)

[^8]: Ordonnances numériques vs sécurisées : tout ce qu'il faut savoir ! - Julie Solutions, consulté le août 19, 2025, [https://www.julie.fr/article-ordonnances-numeriques-vs-ordonnances-securisees-tout-ce-quil-faut-savoir/](https://www.google.com/url?q=https://www.julie.fr/article-ordonnances-numeriques-vs-ordonnances-securisees-tout-ce-quil-faut-savoir/&sa=D&source=editors&ust=1756491753659394&usg=AOvVaw3GXkl9EpIJqX0hrASKSv-e)

[^9]: Section 4 : Conditions de reconnaissance de la force probante des documents comportant des données de santé à caractère personnel créés ou reproduits sous forme numérique et de destruction des documents conservés sous une autre forme que numérique (Articles L1111-25 à L1111-31) - Légifrance, consulté le août 19, 2025, [https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006072665/LEGISCTA000033861544/2022-01-01](https://www.google.com/url?q=https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006072665/LEGISCTA000033861544/2022-01-01&sa=D&source=editors&ust=1756491753660342&usg=AOvVaw1o7H4WcB4-GNS3CNb04j8c)

[^10]: Référentiel Force Probante des documents de santé - Agence du ..., consulté le août 19, 2025, [https://esante.gouv.fr/sites/default/files/2021-03/ANS_DOC_PGSSI-S_REF%20FORCE%20PROBANTE_AN5_FINAL_V1.0.pdf](https://www.google.com/url?q=https://esante.gouv.fr/sites/default/files/2021-03/ANS_DOC_PGSSI-S_REF%2520FORCE%2520PROBANTE_AN5_FINAL_V1.0.pdf&sa=D&source=editors&ust=1756491753660984&usg=AOvVaw3j2cCcb5JjhDHO3huGimnj)

[^11]: Synthèse du référentiel de l'ANS « Force probante des ... - Presanse, consulté le août 19, 2025, [https://www.presanse.fr/wp-content/uploads/2024/07/DIAPORAMA_REFERENTIEL_FORCE_PROBANTE_VDEF.pdf](https://www.google.com/url?q=https://www.presanse.fr/wp-content/uploads/2024/07/DIAPORAMA_REFERENTIEL_FORCE_PROBANTE_VDEF.pdf&sa=D&source=editors&ust=1756491753661560&usg=AOvVaw2jNY0KqD0EiUehsCUW69IM)

[^12]: Référentiel Force Probante des documents de santé - Presanse, consulté le août 19, 2025, [https://www.presanse.fr/wp-content/uploads/2024/07/ANS_DOC_PGSSI-S_REF-FORCE-PROBANTE_AN1_FINAL_v1.0.pdf](https://www.google.com/url?q=https://www.presanse.fr/wp-content/uploads/2024/07/ANS_DOC_PGSSI-S_REF-FORCE-PROBANTE_AN1_FINAL_v1.0.pdf&sa=D&source=editors&ust=1756491753662117&usg=AOvVaw0Bit0Qbsh2uImsT-ml0A6A)

[^13]: La signature électronique : un outil devenu incontournable - francenum.gouv.fr, consulté le août 19, 2025, [https://www.francenum.gouv.fr/guides-et-conseils/pilotage-de-lentreprise/dematerialisation-des-documents/la-signature](https://www.google.com/url?q=https://www.francenum.gouv.fr/guides-et-conseils/pilotage-de-lentreprise/dematerialisation-des-documents/la-signature&sa=D&source=editors&ust=1756491753662727&usg=AOvVaw3fs92DhfTTebv7mxSYGqRx)

[^14]: ETSI EN 319 142-1 V1.2.1 (2024-01), consulté le août 19, 2025, [https://www.etsi.org/deliver/etsi_en/319100_319199/31914201/01.02.01_60/en_31914201v010201p.pdf](https://www.google.com/url?q=https://www.etsi.org/deliver/etsi_en/319100_319199/31914201/01.02.01_60/en_31914201v010201p.pdf&sa=D&source=editors&ust=1756491753663234&usg=AOvVaw0632t4KG1MsPD793ac8ggg)

[^15]: PAdES - Wikipedia, consulté le août 19, 2025, [https://en.wikipedia.org/wiki/PAdES](https://www.google.com/url?q=https://en.wikipedia.org/wiki/PAdES&sa=D&source=editors&ust=1756491753663581&usg=AOvVaw3In4SlbUzLQwFz0f2dXc06)

[^16]: PAdES Format & Electronic Signatures Explained - Adobe, consulté le août 19, 2025, [https://www.adobe.com/uk/acrobat/resources/document-files/pdf-types/pades.html](https://www.google.com/url?q=https://www.adobe.com/uk/acrobat/resources/document-files/pdf-types/pades.html&sa=D&source=editors&ust=1756491753664075&usg=AOvVaw08icFBLN6Ox-MAy-OMfCV-)

[^17]: What Is a PAdES Signature? A Complete Guide (2025) - Certinal, consulté le août 19, 2025, [https://www.certinal.com/blog/pades](https://www.google.com/url?q=https://www.certinal.com/blog/pades&sa=D&source=editors&ust=1756491753664468&usg=AOvVaw1FLl2CI2w1Rt1XOVlWQM4Y)

[^18]: PAdES and Long-Term Archival (LTA) Compliance - Cryptomathic, consulté le août 19, 2025, [https://www.cryptomathic.com/blog/pades-and-long-term-archival-lta](https://www.google.com/url?q=https://www.cryptomathic.com/blog/pades-and-long-term-archival-lta&sa=D&source=editors&ust=1756491753664937&usg=AOvVaw1I_dGtrWv0H69miw5ZS_rT)

[^19]: PAdES - PDF Advanced Electronic Signature, consulté le août 19, 2025, [https://blog.pdf-tools.com/2018/11/pades-pdf-advanced-electronic-signature.html](https://www.google.com/url?q=https://blog.pdf-tools.com/2018/11/pades-pdf-advanced-electronic-signature.html&sa=D&source=editors&ust=1756491753665386&usg=AOvVaw1rVGIrUogUCWbnRstbt4Rw)

[^20]: Digital signature standards: PAdES & CAdES - Nutrient SDK, consulté le août 19, 2025, [https://www.nutrient.io/guides/web/signatures/digital-signatures/standards/](https://www.google.com/url?q=https://www.nutrient.io/guides/web/signatures/digital-signatures/standards/&sa=D&source=editors&ust=1756491753665872&usg=AOvVaw3GtYs-7uBJEHIaxO0WCcZH)

[^21]: SecureBlackbox 16: Basics of PAdES (PDF Advanced Electronic Signatures) - n software, consulté le août 19, 2025, [https://nsoftware.com/kb/articles/legacy/sbb/10-basicsofpades](https://www.google.com/url?q=https://nsoftware.com/kb/articles/legacy/sbb/10-basicsofpades&sa=D&source=editors&ust=1756491753666348&usg=AOvVaw19-U5K9oC-8oO9PfIZmSut)

[^22]: PAdES - PDF Advanced Electronic Signature, consulté le août 19, 2025, [https://www.pdf-tools.com/pdf-knowledge/pades-pdf-advanced-electronic-signature/](https://www.google.com/url?q=https://www.pdf-tools.com/pdf-knowledge/pades-pdf-advanced-electronic-signature/&sa=D&source=editors&ust=1756491753666820&usg=AOvVaw0lCkgLmH4S0vP-BIfz2u39)

[^23]: Pades Signature with multiple DSS Dictionaries - pdf - Stack Overflow, consulté le août 19, 2025, [https://stackoverflow.com/questions/36477390/pades-signature-with-multiple-dss-dictionaries](https://www.google.com/url?q=https://stackoverflow.com/questions/36477390/pades-signature-with-multiple-dss-dictionaries&sa=D&source=editors&ust=1756491753667324&usg=AOvVaw2CzJu9Wew-UykhQ8A5AwtA)

[^24]: PDF Document API - PAdES - BES (LT and LTA levels) Signatures - Blogs - DevExpress, consulté le août 19, 2025, [https://community.devexpress.com/blogs/office/archive/2021/01/07/pdf-document-api-pades-bes-lt-and-lta-levels-signatures.aspx](https://www.google.com/url?q=https://community.devexpress.com/blogs/office/archive/2021/01/07/pdf-document-api-pades-bes-lt-and-lta-levels-signatures.aspx&sa=D&source=editors&ust=1756491753667917&usg=AOvVaw2xOiFHgbHWJVJGV7HgWxtu)

[^25]: Force probante des documents de santé de l'ANS - Spark archives, consulté le août 19, 2025, [https://www.spark-archives.com/fr/force-probante-des-documents-de-sante-de-lans/](https://www.google.com/url?q=https://www.spark-archives.com/fr/force-probante-des-documents-de-sante-de-lans/&sa=D&source=editors&ust=1756491753668413&usg=AOvVaw0_G0__0KyP5xXNlj5CgT-8)

[^26]: Archivage électronique à valeur probante : les normes à respecter - Freedz, consulté le août 19, 2025, [https://freedz.io/facture-et-archivage-electronique-a-valeur-probante-quelles-sont-les-normes-a-respecter/](https://www.google.com/url?q=https://freedz.io/facture-et-archivage-electronique-a-valeur-probante-quelles-sont-les-normes-a-respecter/&sa=D&source=editors&ust=1756491753669026&usg=AOvVaw3-dbjU2G3UhzAGqLM4k9Zi)

[^27]: Cryptographic Message Syntax - Wikipedia, consulté le août 19, 2025, [https://en.wikipedia.org/wiki/Cryptographic_Message_Syntax](https://www.google.com/url?q=https://en.wikipedia.org/wiki/Cryptographic_Message_Syntax&sa=D&source=editors&ust=1756491753669472&usg=AOvVaw0PgxXVc6CDfFGsHH0as-nT)

[^28]: RFC 5652: Cryptographic Message Syntax (CMS), consulté le août 19, 2025, [https://www.rfc-editor.org/rfc/rfc5652.html](https://www.google.com/url?q=https://www.rfc-editor.org/rfc/rfc5652.html&sa=D&source=editors&ust=1756491753669878&usg=AOvVaw1LJppGr0yXTtpyHyUt2hXr)

[^29]: SIST EN 319 122-1 V1.3.1:2023 - Electronic Signatures and Infrastructures (ESI) - CAdES digital - iTeh Standards, consulté le août 19, 2025, [https://standards.iteh.ai/catalog/standards/sist/b2c23f0c-6f04-4085-857d-164279cc663b/sist-en-319-122-1-v1-3-1-2023](https://www.google.com/url?q=https://standards.iteh.ai/catalog/standards/sist/b2c23f0c-6f04-4085-857d-164279cc663b/sist-en-319-122-1-v1-3-1-2023&sa=D&source=editors&ust=1756491753670490&usg=AOvVaw1SugYx0AG8b9LpXnvQznS5)

[^30]: SignedData (Bouncy Castle Library 1.64 API Specification) - javadoc.io, consulté le août 19, 2025, [https://javadoc.io/doc/org.bouncycastle/bcprov-jdk15on/1.64/org/bouncycastle/asn1/cms/SignedData.html](https://www.google.com/url?q=https://javadoc.io/doc/org.bouncycastle/bcprov-jdk15on/1.64/org/bouncycastle/asn1/cms/SignedData.html&sa=D&source=editors&ust=1756491753671030&usg=AOvVaw3PMEeQemZlWtb9w0Ty6gDo)

[^31]: SignedData | pki.js, consulté le août 19, 2025, [https://pkijs.org/docs/api/classes/SignedData/](https://www.google.com/url?q=https://pkijs.org/docs/api/classes/SignedData/&sa=D&source=editors&ust=1756491753671394&usg=AOvVaw1TdiibILhL5GiojDMgyt77)

[^32]: SignerInfo in cryptographic_message_syntax - Rust - Docs.rs, consulté le août 19, 2025, [https://docs.rs/cryptographic-message-syntax/latest/cryptographic_message_syntax/struct.SignerInfo.html](https://www.google.com/url?q=https://docs.rs/cryptographic-message-syntax/latest/cryptographic_message_syntax/struct.SignerInfo.html&sa=D&source=editors&ust=1756491753671924&usg=AOvVaw1SECduadJY_PFyYyyGWX2Z)

[^33]: PKCS#7: SignedData and SignerInfo — Signify 0.8.1 documentation, consulté le août 19, 2025, [https://signify.readthedocs.io/en/latest/pkcs7.html](https://www.google.com/url?q=https://signify.readthedocs.io/en/latest/pkcs7.html&sa=D&source=editors&ust=1756491753672368&usg=AOvVaw3p-HT9tzwdpmecY_Vhhalb)

[^34]: Basics of Digital Signature Techniques and Trust Services - BSI, consulté le août 19, 2025, [https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/ElekSignatur/esig_pdf.pdf?\_\_blob=publicationFile](https://www.google.com/url?q=https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/ElekSignatur/esig_pdf.pdf?__blob%3DpublicationFile&sa=D&source=editors&ust=1756491753672928&usg=AOvVaw3T-yMLcM1SHu_nsyYkxqSa)

[^35]: RFC 5126: CMS Advanced Electronic Signatures (CAdES), consulté le août 19, 2025, [https://www.rfc-editor.org/rfc/rfc5126.html](https://www.google.com/url?q=https://www.rfc-editor.org/rfc/rfc5126.html&sa=D&source=editors&ust=1756491753673343&usg=AOvVaw0sgz7aHflma35dt63iMKoc)

[^36]: P4 PAdES LT-Level [e-İmza Teknolojileri Test Suit e-Signature Technologies Test Suite ], consulté le août 19, 2025, [https://yazilim.kamusm.gov.tr/eit-wiki/doku.php?id=en:p4_pades_lt-level](https://www.google.com/url?q=https://yazilim.kamusm.gov.tr/eit-wiki/doku.php?id%3Den:p4_pades_lt-level&sa=D&source=editors&ust=1756491753673860&usg=AOvVaw1eQVHi6ewWAI0VDZMIR-v0)

[^37]: Blog | Signing and verifying PDF documents with TMS Cryptography Pack, consulté le août 19, 2025, [https://www.tmssoftware.com/site/blog.asp?post=1205](https://www.google.com/url?q=https://www.tmssoftware.com/site/blog.asp?post%3D1205&sa=D&source=editors&ust=1756491753674294&usg=AOvVaw2ejjVPdZ3KU1C9ee_Ta998)

[^38]: TS 101 733 - V2.1.1 - Electronic Signatures and Infrastructures (ESI) - ETSI, consulté le août 19, 2025, [https://www.etsi.org/deliver/etsi_ts/101700_101799/101733/02.01.01_60/ts_101733v020101p.pdf](https://www.google.com/url?q=https://www.etsi.org/deliver/etsi_ts/101700_101799/101733/02.01.01_60/ts_101733v020101p.pdf&sa=D&source=editors&ust=1756491753674814&usg=AOvVaw0nfMCKNwEeRp9MNkcoY-AD)

[^39]: signing time as optional in PDF spec but mandatory in PAdES · Issue #505 - GitHub, consulté le août 19, 2025, [https://github.com/pdf-association/pdf-issues/issues/505](https://www.google.com/url?q=https://github.com/pdf-association/pdf-issues/issues/505&sa=D&source=editors&ust=1756491753675249&usg=AOvVaw2DXq3l1lvoaKDCZeDm8uoj)

[^40]: java - PAdES Signature Level - Adobe Acrobat - Stack Overflow, consulté le août 19, 2025, [https://stackoverflow.com/questions/67055789/pades-signature-level-adobe-acrobat](https://www.google.com/url?q=https://stackoverflow.com/questions/67055789/pades-signature-level-adobe-acrobat&sa=D&source=editors&ust=1756491753675731&usg=AOvVaw1tdtGpvICEcbYY9kpmGzhw)

[^41]: PAdES Signature Attribute signingTime forbidden - Stack Overflow, consulté le août 19, 2025, [https://stackoverflow.com/questions/48544722/pades-signature-attribute-signingtime-forbidden](https://www.google.com/url?q=https://stackoverflow.com/questions/48544722/pades-signature-attribute-signingtime-forbidden&sa=D&source=editors&ust=1756491753676262&usg=AOvVaw1F8EObt-LbLQ06YhAOlfO-)

[^42]: PAdESTimestampSource (Digital Signature Services 6.2 API), consulté le août 19, 2025, [https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/apidocs/eu/europa/esig/dss/pades/validation/timestamp/PAdESTimestampSource.html](https://www.google.com/url?q=https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/apidocs/eu/europa/esig/dss/pades/validation/timestamp/PAdESTimestampSource.html&sa=D&source=editors&ust=1756491753676874&usg=AOvVaw2a1MmZXeQQ0BPmlE4xdfRn)

[^43]: pyhanko.sign.signers module - Read the Docs, consulté le août 19, 2025, [https://pyhanko.readthedocs.io/en/0.4.0/api-docs/pyhanko.sign.signers.html](https://www.google.com/url?q=https://pyhanko.readthedocs.io/en/0.4.0/api-docs/pyhanko.sign.signers.html&sa=D&source=editors&ust=1756491753677357&usg=AOvVaw2YPsml3oXCAEX5Vkxs_enm)

[^44]: Class DigitalSignatureField - Apryse Documentation, consulté le août 19, 2025, [https://sdk.apryse.com/api/PDFTronSDK/dotnetcore/pdftron.PDF.DigitalSignatureField.html](https://www.google.com/url?q=https://sdk.apryse.com/api/PDFTronSDK/dotnetcore/pdftron.PDF.DigitalSignatureField.html&sa=D&source=editors&ust=1756491753677872&usg=AOvVaw1SMNB93O-WKRlbBSNRSMXf)

[^45]: How to validate digitally signed PDFs correctly? - PDF Association, consulté le août 19, 2025, [https://pdfa.org/wp-content/uploads/2020/07/2020-10-07_PDF-Signature-Validation_comp.pdf](https://www.google.com/url?q=https://pdfa.org/wp-content/uploads/2020/07/2020-10-07_PDF-Signature-Validation_comp.pdf&sa=D&source=editors&ust=1756491753678374&usg=AOvVaw2Mr2VgLoa8WdMCGaMSnwO3)

[^46]: Visible Signature in a PDF file - Stack Overflow, consulté le août 19, 2025, [https://stackoverflow.com/questions/56773460/visible-signature-in-a-pdf-file](https://www.google.com/url?q=https://stackoverflow.com/questions/56773460/visible-signature-in-a-pdf-file&sa=D&source=editors&ust=1756491753678958&usg=AOvVaw1_A-e4KCNoyiFXCmuQJpL6)

[^47]: PDAcroForm (PDFBox reactor 2.0.13 API), consulté le août 19, 2025, [https://pdfbox.apache.org/docs/2.0.13/javadocs/org/apache/pdfbox/pdmodel/interactive/form/PDAcroForm.html](https://www.google.com/url?q=https://pdfbox.apache.org/docs/2.0.13/javadocs/org/apache/pdfbox/pdmodel/interactive/form/PDAcroForm.html&sa=D&source=editors&ust=1756491753679454&usg=AOvVaw1kK5sl9JuQfRr3KbiPPMEm)

[^48]:
    7.  AcroForms - Developing with PDF [Book] - O'Reilly Media, consulté le août 19, 2025, [https://www.oreilly.com/library/view/developing-with-pdf/9781449327903/ch07.html](https://www.google.com/url?q=https://www.oreilly.com/library/view/developing-with-pdf/9781449327903/ch07.html&sa=D&source=editors&ust=1756491753679933&usg=AOvVaw07HMhgdcd1Y8WfvFkRJlsd)

[^49]: Signing a PDF with adbe.pkcs7.detached - Stack Overflow, consulté le août 19, 2025, [https://stackoverflow.com/questions/39507483/signing-a-pdf-with-adbe-pkcs7-detached](https://www.google.com/url?q=https://stackoverflow.com/questions/39507483/signing-a-pdf-with-adbe-pkcs7-detached&sa=D&source=editors&ust=1756491753680443&usg=AOvVaw1r212Srikcks0B0Drb0rZG)

[^50]: Why is PDF form information stored on both 'Root.AcroForm.Fields' & 'Root.Pages.Kids[0].Annots' - Stack Overflow, consulté le août 19, 2025, [https://stackoverflow.com/questions/61832674/why-is-pdf-form-information-stored-on-both-root-acroform-fields-root-pages](https://www.google.com/url?q=https://stackoverflow.com/questions/61832674/why-is-pdf-form-information-stored-on-both-root-acroform-fields-root-pages&sa=D&source=editors&ust=1756491753680948&usg=AOvVaw083huDMdctXT_0MoDnSZW9)

[^51]: PDSignature (PDFBox reactor 2.0.5 API), consulté le août 19, 2025, [https://pdfbox.apache.org/docs/2.0.5/javadocs/org/apache/pdfbox/pdmodel/interactive/digitalsignature/PDSignature.html](https://www.google.com/url?q=https://pdfbox.apache.org/docs/2.0.5/javadocs/org/apache/pdfbox/pdmodel/interactive/digitalsignature/PDSignature.html&sa=D&source=editors&ust=1756491753681351&usg=AOvVaw2ZqZCxNKnO1Mw4eqpX21qK)

[^52]: TS 119 144-3 - V1.1.1 - Electronic Signatures and Infrastructures (ESI) - ETSI, consulté le août 19, 2025, [https://www.etsi.org/deliver/etsi_ts/119100_119199/11914403/01.01.01_60/ts_11914403v010101p.pdf](https://www.google.com/url?q=https://www.etsi.org/deliver/etsi_ts/119100_119199/11914403/01.01.01_60/ts_11914403v010101p.pdf&sa=D&source=editors&ust=1756491753681797&usg=AOvVaw0SYAPMZk604Upj2I_W8ms3)

[^53]: PDF Reference, version 1.7 - VeryPDF, consulté le août 19, 2025, [https://www.verypdf.com/document/pdf-format-reference/txtidx0726.htm](https://www.google.com/url?q=https://www.verypdf.com/document/pdf-format-reference/txtidx0726.htm&sa=D&source=editors&ust=1756491753682119&usg=AOvVaw2q8pDOo_TbVGbUde0mJtUm)

[^54]: PDF electronic signature ByteRange - Stack Overflow, consulté le août 19, 2025, [https://stackoverflow.com/questions/50876586/pdf-electronic-signature-byterange](https://www.google.com/url?q=https://stackoverflow.com/questions/50876586/pdf-electronic-signature-byterange&sa=D&source=editors&ust=1756491753682456&usg=AOvVaw1_mGwcxm8P1BUDposuaWnM)

[^55]: Incremental Updates in PDF files - Foxit PDF SDK, consulté le août 19, 2025, [https://developers.foxit.com/developer-hub/document/incremental-updates/](https://www.google.com/url?q=https://developers.foxit.com/developer-hub/document/incremental-updates/&sa=D&source=editors&ust=1756491753682793&usg=AOvVaw3QRIdIFBHZpD9WzToyfLK7)

[^56]: How to Create Byte-Range in 1.x.x · Issue #203 · Hopding/pdf-lib - GitHub, consulté le août 19, 2025, [https://github.com/Hopding/pdf-lib/issues/203](https://www.google.com/url?q=https://github.com/Hopding/pdf-lib/issues/203&sa=D&source=editors&ust=1756491753683107&usg=AOvVaw0O_CXjm7iX56nZbJlMRnaf)

[^57]: Incremental Document updates · Issue #816 · Hopding/pdf-lib - GitHub, consulté le août 19, 2025, [https://github.com/Hopding/pdf-lib/issues/816](https://www.google.com/url?q=https://github.com/Hopding/pdf-lib/issues/816&sa=D&source=editors&ust=1756491753683408&usg=AOvVaw277iyzMHQcopJ59XKmcQGf)

[^58]: Custom Signature Appearances — Acrobat Desktop Digital Signature Guide - Adobe, consulté le août 19, 2025, [https://www.adobe.com/devnet-docs/acrobatetk/tools/DigSigDC/appearances.html](https://www.google.com/url?q=https://www.adobe.com/devnet-docs/acrobatetk/tools/DigSigDC/appearances.html&sa=D&source=editors&ust=1756491753683803&usg=AOvVaw2cbc3Knitwe9PiuH3DH2Ae)

[^59]: Adding Visible Electronic Signatures To PDFs | BG-JUG, consulté le août 19, 2025, [https://jug.bg/2018/02/adding-visible-electronic-signatures-to-pdfs/](https://www.google.com/url?q=https://jug.bg/2018/02/adding-visible-electronic-signatures-to-pdfs/&sa=D&source=editors&ust=1756491753684139&usg=AOvVaw049dUesIi5foB-gigyObz4)

[^60]: pdf-lib-incremental-save - NPM, consulté le août 19, 2025, [https://www.npmjs.com/package/pdf-lib-incremental-save](https://www.google.com/url?q=https://www.npmjs.com/package/pdf-lib-incremental-save&sa=D&source=editors&ust=1756491753684426&usg=AOvVaw2rKDA_bPY40YVHEWRIXYY-)

[^61]: ironpdf.com, consulté le août 19, 2025, [https://ironpdf.com/nodejs/blog/compare-to-other-components/node-pdf-library/#:~:text=PDF%2DLIB%20is%20an%20open,but%20also%20manipulate%20existing%20documents.](https://www.google.com/url?q=https://ironpdf.com/nodejs/blog/compare-to-other-components/node-pdf-library/%23:~:text%3DPDF%252DLIB%2520is%2520an%2520open,but%2520also%2520manipulate%2520existing%2520documents.&sa=D&source=editors&ust=1756491753685007&usg=AOvVaw0sOvw8C0_EuckMj-rJ8q99)

[^62]: Top JavaScript PDF generator libraries for 2025 - Nutrient SDK, consulté le août 19, 2025, [https://www.nutrient.io/blog/top-js-pdf-libraries/](https://www.google.com/url?q=https://www.nutrient.io/blog/top-js-pdf-libraries/&sa=D&source=editors&ust=1756491753685390&usg=AOvVaw1L0Z6quo9UIda-H20y3SqD)

[^63]: pki.js, consulté le août 19, 2025, [https://pkijs.org/](https://www.google.com/url?q=https://pkijs.org/&sa=D&source=editors&ust=1756491753685626&usg=AOvVaw3aOL02F3YEKDSVSAYW5_B-)

[^64]: node-forge vs asn1.js vs crypto-js vs jsrsasign vs pkijs | JavaScript Cryptography and ASN.1 Libraries Comparison - NPM Compare, consulté le août 19, 2025, [https://npm-compare.com/node-forge,asn1.js,crypto-js,jsrsasign,pkijs](https://www.google.com/url?q=https://npm-compare.com/node-forge,asn1.js,crypto-js,jsrsasign,pkijs&sa=D&source=editors&ust=1756491753686065&usg=AOvVaw14kTEiQyiCAKLBVEcWkbkS)

[^65]: Healthcare Professional Card (CPS) & Mobile ID (eCPS) - IN Groupe, consulté le août 19, 2025, [https://ingroupe.com/product/healthcare-professional-card-ecps/](https://www.google.com/url?q=https://ingroupe.com/product/healthcare-professional-card-ecps/&sa=D&source=editors&ust=1756491753686438&usg=AOvVaw0bs_dBLklNe8Xf-dZNVw-x)

[^66]: Applied PKCS #11 - python-pkcs11 - Read the Docs, consulté le août 19, 2025, [https://python-pkcs11.readthedocs.io/en/latest/applied.html](https://www.google.com/url?q=https://python-pkcs11.readthedocs.io/en/latest/applied.html&sa=D&source=editors&ust=1756491753686878&usg=AOvVaw13IIm-rbq3xDLVzoYezgpR)

[^67]: Smart card authentication - Ubuntu Server documentation, consulté le août 19, 2025, [https://documentation.ubuntu.com/server/how-to/security/smart-card-authentication/](https://www.google.com/url?q=https://documentation.ubuntu.com/server/how-to/security/smart-card-authentication/&sa=D&source=editors&ust=1756491753687287&usg=AOvVaw0qF0xNw3E-tvrtJryx7NKK)

[^68]: Differences between two RSA signatures using OpenSSL - Cryptography Stack Exchange, consulté le août 19, 2025, [https://crypto.stackexchange.com/questions/109344/differences-between-two-rsa-signatures-using-openssl](https://www.google.com/url?q=https://crypto.stackexchange.com/questions/109344/differences-between-two-rsa-signatures-using-openssl&sa=D&source=editors&ust=1756491753687786&usg=AOvVaw0ck7WUL3x2pQt3eYohr_fp)

[^69]: Offloading hashing and symmetric encryption to HSM - Information Security Stack Exchange, consulté le août 19, 2025, [https://security.stackexchange.com/questions/165709/offloading-hashing-and-symmetric-encryption-to-hsm](https://www.google.com/url?q=https://security.stackexchange.com/questions/165709/offloading-hashing-and-symmetric-encryption-to-hsm&sa=D&source=editors&ust=1756491753688276&usg=AOvVaw0Su2pIvqSOHuq3BtZi9-wX)

[^70]: List of Constants - HID Global Documentation, consulté le août 19, 2025, [https://docs.hidglobal.com/activid-activclient-v8.3/sdk/pkcs-api-reference/list-of-constants.htm](https://www.google.com/url?q=https://docs.hidglobal.com/activid-activclient-v8.3/sdk/pkcs-api-reference/list-of-constants.htm&sa=D&source=editors&ust=1756491753688727&usg=AOvVaw2QCSN0yig_s3Qd7fIDqqqB)

[^71]: @transmission-dynamics/pkcs11js - npm, consulté le août 19, 2025, [https://www.npmjs.com/package/@transmission-dynamics/pkcs11js](https://www.google.com/url?q=https://www.npmjs.com/package/@transmission-dynamics/pkcs11js&sa=D&source=editors&ust=1756491753689093&usg=AOvVaw3xZcGA3OPDDMX_rETSumds)
