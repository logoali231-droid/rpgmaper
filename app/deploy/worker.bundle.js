// node_modules/jose/dist/webapi/lib/buffer_utils.js
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const strictDecoder = new TextDecoder("utf-8", { fatal: !0 });
function concat(...buffers) {
	const size = buffers.reduce((acc, { length }) => acc + length, 0), buf = new Uint8Array(size);
	let i = 0;
	for (const buffer of buffers) buf.set(buffer, i), i += buffer.length;
	return buf;
}
const NON_ASCII = /[^\x00-\x7f]/;
function encode(string) {
	if (typeof string == "string" && string.length >= 128) {
		if (NON_ASCII.test(string)) throw new TypeError("non-ASCII string encountered in encode()");
		return encoder.encode(string);
	}
	const bytes = new Uint8Array(string.length);
	for (let i = 0; i < string.length; i++) {
		const code = string.charCodeAt(i);
		if (code > 127) throw new TypeError("non-ASCII string encountered in encode()");
		bytes[i] = code;
	}
	return bytes;
}
function decodeBase64(encoded, url = !1) {
	if (Uint8Array.fromBase64) return Uint8Array.fromBase64(encoded, { alphabet: url ? "base64url" : "base64" });
	if (url) {
		if (encoded.includes("+") || encoded.includes("/")) throw new TypeError("Invalid base64url");
		encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
	}
	const binary = atob(encoded), bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
// node_modules/jose/dist/webapi/util/errors.js
var JOSEError = class extends Error {
	static code = "ERR_JOSE_GENERIC";
	code = "ERR_JOSE_GENERIC";
	constructor(message, options) {
		super(message, options), this.name = this.constructor.name, Error.captureStackTrace?.(this, this.constructor);
	}
};
var JWTClaimValidationFailed = class extends JOSEError {
	static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
	code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
	claim;
	reason;
	payload;
	constructor(message, payload, claim = "unspecified", reason = "unspecified") {
		super(message, { cause: {
			claim,
			reason,
			payload
		} }), this.claim = claim, this.reason = reason, this.payload = payload;
	}
};
var JWTExpired = class extends JOSEError {
	static code = "ERR_JWT_EXPIRED";
	code = "ERR_JWT_EXPIRED";
	claim;
	reason;
	payload;
	constructor(message, payload, claim = "unspecified", reason = "unspecified") {
		super(message, { cause: {
			claim,
			reason,
			payload
		} }), this.claim = claim, this.reason = reason, this.payload = payload;
	}
};
var JOSEAlgNotAllowed = class extends JOSEError {
	static code = "ERR_JOSE_ALG_NOT_ALLOWED";
	code = "ERR_JOSE_ALG_NOT_ALLOWED";
};
var JOSENotSupported = class extends JOSEError {
	static code = "ERR_JOSE_NOT_SUPPORTED";
	code = "ERR_JOSE_NOT_SUPPORTED";
};
var JWSInvalid = class extends JOSEError {
	static code = "ERR_JWS_INVALID";
	code = "ERR_JWS_INVALID";
};
var JWTInvalid = class extends JOSEError {
	static code = "ERR_JWT_INVALID";
	code = "ERR_JWT_INVALID";
};
var JWKSInvalid = class extends JOSEError {
	static code = "ERR_JWKS_INVALID";
	code = "ERR_JWKS_INVALID";
};
var JWKSNoMatchingKey = class extends JOSEError {
	static code = "ERR_JWKS_NO_MATCHING_KEY";
	code = "ERR_JWKS_NO_MATCHING_KEY";
	constructor(message = "no applicable key found in the JSON Web Key Set", options) {
		super(message, options);
	}
};
var JWKSMultipleMatchingKeys = class extends JOSEError {
	[Symbol.asyncIterator] = async function* () {};
	static code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
	code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
	constructor(message = "multiple matching keys found in the JSON Web Key Set", options) {
		super(message, options);
	}
};
var JWKSTimeout = class extends JOSEError {
	static code = "ERR_JWKS_TIMEOUT";
	code = "ERR_JWKS_TIMEOUT";
	constructor(message = "request timed out", options) {
		super(message, options);
	}
};
var JWSSignatureVerificationFailed = class extends JOSEError {
	static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
	code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
	constructor(message = "signature verification failed", options) {
		super(message, options);
	}
};
// node_modules/jose/dist/webapi/util/base64url.js
const invalid = "The input to be decoded is not correctly encoded.";
function decode(input) {
	try {
		return decodeBase64(typeof input == "string" ? input : decoder.decode(input), !0);
	} catch (cause) {
		throw new TypeError(invalid, { cause });
	}
}
// node_modules/jose/dist/webapi/lib/validate.js
function isObject(input) {
	if (typeof input != "object" || input === null || Object.prototype.toString.call(input) !== "[object Object]") return !1;
	const prototype = Object.getPrototypeOf(input);
	return prototype === null || Object.getPrototypeOf(prototype) === null;
}
function isJwkSet(input) {
	return isObject(input) && Array.isArray(input.keys) && Array.from(input.keys).every(isObject);
}
function isDisjoint(...headers) {
	const parameters = /* @__PURE__ */ new Set();
	for (const header of headers) if (header) for (const parameter of Object.keys(header)) {
		if (parameters.has(parameter)) return !1;
		parameters.add(parameter);
	}
	return !0;
}
function decodeBase64url(value, label, ErrorClass) {
	try {
		return decode(value);
	} catch (cause) {
		throw new ErrorClass(`Failed to base64url decode the ${label}`, { cause });
	}
}
function encodeAsciiMember(value, label, ErrorClass) {
	try {
		return encode(value);
	} catch (cause) {
		throw new ErrorClass(`The ${label} is not a valid base64url string`, { cause });
	}
}
function parseJoseHeader(encodedProtectedHeader, ErrorClass, message) {
	let parsed;
	try {
		parsed = JSON.parse(strictDecoder.decode(decode(encodedProtectedHeader)));
	} catch (cause) {
		throw new ErrorClass(message, { cause });
	}
	if (!isObject(parsed)) throw new ErrorClass(message);
	return parsed;
}
const JWS_RECOGNIZED = {
	__proto__: null,
	b64: !0
};
function validateAlgorithms(option, algorithms) {
	if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s != "string"))) throw new TypeError(`"${option}" option must be an array of strings`);
	return algorithms === void 0 ? void 0 : new Set(algorithms);
}
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
	if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0) throw new Err("\"crit\" (Critical) Header Parameter MUST be integrity protected");
	if (!protectedHeader || protectedHeader.crit === void 0) return [];
	if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input != "string" || input.length === 0)) throw new Err("\"crit\" (Critical) Header Parameter MUST be an array of non-empty strings when present");
	const recognized = recognizedOption === void 0 ? recognizedDefault : {
		__proto__: null,
		...recognizedOption,
		...recognizedDefault
	};
	for (const parameter of protectedHeader.crit) {
		if (!(parameter in recognized)) throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
		if (!Object.hasOwn(joseHeader, parameter) || joseHeader[parameter] === void 0) throw new Err(`Extension Header Parameter "${parameter}" is missing`);
		if (recognized[parameter] && (!Object.hasOwn(protectedHeader, parameter) || protectedHeader[parameter] === void 0)) throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
	}
	return protectedHeader.crit;
}
function validateB64(protectedHeader, extensions) {
	if (extensions.includes("b64")) {
		const b64 = protectedHeader.b64;
		if (typeof b64 != "boolean") throw new JWSInvalid("The \"b64\" (base64url-encode payload) Header Parameter must be a boolean");
		return b64;
	}
	return !0;
}
// node_modules/jose/dist/webapi/lib/key.js
const tag = (key) => key[Symbol.toStringTag];
const jwkMatchesOp = (entry, key, usage) => {
	const { alg } = entry;
	if (key.use !== void 0) {
		const expected = usage === "sign" || usage === "verify" ? "sig" : "enc";
		if (key.use !== expected) throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
	}
	if (key.alg !== void 0 && key.alg !== alg) throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
	if (Array.isArray(key.key_ops)) {
		const expectedKeyOp = usage === "encrypt" || usage === "decrypt" ? entry.ops?.[usage === "encrypt" ? 0 : 1] : usage;
		if (expectedKeyOp && !key.key_ops.includes(expectedKeyOp)) throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
	}
};
async function prepareKey(entry, key, usage) {
	const { alg, secret } = entry, requiresPrivateKey = usage === "decrypt" || usage === "sign";
	if (secret && key instanceof Uint8Array) return key;
	let normalized, keyObject;
	if (isObject(key)) {
		if (normalized = normalizeJwk(key), typeof normalized.kty != "string") throw invalidKeyType(alg, key, secret);
		if (!(secret ? normalized.kty === "oct" && typeof normalized.k == "string" : normalized.kty !== "oct" && (requiresPrivateKey ? normalized.kty === "AKP" && typeof normalized.priv == "string" || typeof normalized.d == "string" : normalized.d === void 0 && normalized.priv === void 0))) throw new TypeError(secret ? "JSON Web Key for symmetric algorithms must have JWK \"kty\" (Key Type) equal to \"oct\" and the JWK \"k\" (Key Value) present" : `JSON Web Key for this operation must be a ${requiresPrivateKey ? "private" : "public"} JWK`);
		if (jwkMatchesOp(entry, normalized, usage), normalized.kty === "oct") return decode(normalized.k);
		if (!Object.isFrozen(key)) {
			const { key_ops } = key;
			Array.isArray(key_ops) && Object.freeze(key_ops), Object.freeze(key);
		}
	} else {
		if (!isKeyLike(key)) throw invalidKeyType(alg, key, secret);
		const expectedType = secret ? "secret" : requiresPrivateKey ? "private" : "public";
		if (key.type !== expectedType && (secret || [
			"secret",
			"public",
			"private"
		].includes(key.type))) throw new TypeError(`${tag(key)} instances must be of type "${expectedType}" for the ${alg} algorithm`);
		if (isCryptoKey(key)) return key;
		if (keyObject = key, keyObject.type === "secret") return keyObject.export();
	}
	cache ||= /* @__PURE__ */ new WeakMap();
	const cacheKey = key;
	let cached = cache.get(cacheKey);
	if (cached?.[alg]) return cached[alg];
	if (cached || cache.set(cacheKey, cached = {}), keyObject && typeof keyObject.toCryptoKey == "function") {
		const isPublic = keyObject.type === "public", crv = nist[keyObject.asymmetricKeyDetails?.namedCurve], params = entry.resolve?.({
			crv,
			asymmetricKeyType: keyObject.asymmetricKeyType
		}) ?? entry.subtle;
		return cached[alg] = keyObject.toCryptoKey(params, isPublic, entry.usages[isPublic ? 0 : 1]);
	}
	return normalized ??= keyObject.export({ format: "jwk" }), normalized.alg = alg, cached[alg] = await jwkToKey(entry, normalized);
}
let cache;
const nist = {
	__proto__: null,
	prime256v1: "P-256",
	secp384r1: "P-384",
	secp521r1: "P-521"
};
const isCryptoKey = (key) => {
	if (key?.[Symbol.toStringTag] === "CryptoKey") return !0;
	try {
		return key instanceof CryptoKey;
	} catch {
		return !1;
	}
};
const isKeyObject = (key) => key?.[Symbol.toStringTag] === "KeyObject";
const isKeyLike = (key) => isCryptoKey(key) || isKeyObject(key);
function message(msg, actual, ...types) {
	if (types.length > 2) {
		const last = types.pop();
		msg += `one of type ${types.join(", ")}, or ${last}.`;
	} else types.length === 2 ? msg += `one of type ${types[0]} or ${types[1]}.` : msg += `of type ${types[0]}.`;
	return actual == null ? msg += ` Received ${actual}` : typeof actual == "function" && actual.name ? msg += ` Received function ${actual.name}` : typeof actual == "object" && actual != null && actual.constructor?.name && (msg += ` Received an instance of ${actual.constructor.name}`), msg;
}
function invalidKeyType(alg, actual, secret) {
	const types = [
		"CryptoKey",
		"KeyObject",
		"JSON Web Key"
	];
	return secret && types.push("Uint8Array"), new TypeError(message(`Key for the ${alg} algorithm must be `, actual, ...types));
}
const unusable = (name, prop = "algorithm.name") => /* @__PURE__ */ new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
function checkUsage(key, usage) {
	if (usage && !key.usages.includes(usage)) throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
}
function checkModulusLength(alg, key) {
	const { modulusLength } = key.algorithm;
	if (typeof modulusLength != "number" || modulusLength < 2048) throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
}
function checkCryptoKey(key, expected, usage) {
	const algorithm = key.algorithm;
	if (algorithm.name !== expected.name) throw unusable(expected.name);
	if (expected.hash && algorithm.hash?.name !== expected.hash) throw unusable(expected.hash, "algorithm.hash");
	if (expected.namedCurve && algorithm.namedCurve !== expected.namedCurve) throw unusable(expected.namedCurve, "algorithm.namedCurve");
	if (expected.length !== void 0 && algorithm.length !== expected.length) throw unusable(expected.length, "algorithm.length");
	checkUsage(key, usage);
}
function snapshotJwk(jwk) {
	return {
		__proto__: null,
		...jwk
	};
}
function normalizeJwk(jwk) {
	const normalized = snapshotJwk(jwk);
	if (normalized.ext !== void 0 && typeof normalized.ext != "boolean") throw new TypeError("\"ext\" (Extractable) Parameter must be a boolean");
	if (normalized.key_ops !== void 0) {
		const value = normalized.key_ops, keyOps = Array.isArray(value) ? [...value] : void 0;
		if (!keyOps || keyOps.some((operation) => typeof operation != "string") || new Set(keyOps).size !== keyOps.length) throw new TypeError("\"key_ops\" (Key Operations) Parameter must be an array of unique strings");
		normalized.key_ops = keyOps;
	}
	return normalized;
}
async function jwkToKey(entry, jwk, extractable) {
	if (!entry.kty.includes(jwk.kty)) throw new JOSENotSupported("Invalid or unsupported JWK \"alg\" (Algorithm) Parameter value");
	const algorithm = entry.resolve?.({
		kty: jwk.kty,
		crv: jwk.crv
	}) ?? entry.subtle, isPrivate = !!(jwk.d || jwk.priv), keyData = {
		...jwk,
		ext: extractable ?? jwk.ext
	};
	return keyData.kty !== "AKP" && delete keyData.alg, delete keyData.use, crypto.subtle.importKey("jwk", keyData, algorithm, keyData.ext ?? !isPrivate, jwk.key_ops ?? entry.usages[isPrivate ? 1 : 0]);
}
async function rawKey(key, expected, usage, extractable = !1) {
	return key instanceof Uint8Array && (key = await crypto.subtle.importKey("raw", key, expected, extractable, [usage])), checkCryptoKey(key, expected, usage), key;
}
// node_modules/jose/dist/webapi/lib/key_descriptor.js
function table(entries) {
	const out = { __proto__: null };
	for (const alg in entries) out[alg] = {
		...entries[alg],
		alg
	};
	return out;
}
// node_modules/jose/dist/webapi/lib/jws_algorithms.js
const sig = [["verify"], ["sign"]];
function hmac(bits) {
	const subtle = {
		name: "HMAC",
		hash: `SHA-${bits}`
	};
	return {
		kty: ["oct"],
		secret: !0,
		subtle,
		signing: subtle,
		usages: sig
	};
}
function rsa(bits, saltLength) {
	const subtle = {
		name: saltLength ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
		hash: `SHA-${bits}`
	};
	return {
		kty: ["RSA"],
		subtle,
		signing: saltLength ? {
			...subtle,
			saltLength
		} : subtle,
		usages: sig,
		minRsaBits: 2048
	};
}
function ecdsa(crv, bits) {
	return {
		kty: ["EC"],
		crv,
		subtle: {
			name: "ECDSA",
			namedCurve: crv
		},
		signing: {
			name: "ECDSA",
			hash: `SHA-${bits}`
		},
		usages: sig
	};
}
function eddsa() {
	const subtle = { name: "Ed25519" };
	return {
		kty: ["OKP"],
		crv: "Ed25519",
		subtle,
		signing: subtle,
		usages: sig
	};
}
function mldsa(parameterSet) {
	const subtle = { name: `ML-DSA-${parameterSet}` };
	return {
		kty: ["AKP"],
		subtle,
		signing: subtle,
		usages: sig
	};
}
const JWS = table({
	HS256: hmac(256),
	HS384: hmac(384),
	HS512: hmac(512),
	RS256: rsa(256),
	RS384: rsa(384),
	RS512: rsa(512),
	PS256: rsa(256, 32),
	PS384: rsa(384, 48),
	PS512: rsa(512, 64),
	ES256: ecdsa("P-256", 256),
	ES384: ecdsa("P-384", 384),
	ES512: ecdsa("P-521", 512),
	EdDSA: eddsa(),
	Ed25519: eddsa(),
	"ML-DSA-44": mldsa(44),
	"ML-DSA-65": mldsa(65),
	"ML-DSA-87": mldsa(87)
});
function jwsAlgorithm(alg) {
	const entry = typeof alg == "string" ? JWS[alg] : void 0;
	if (!entry) throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
	return entry;
}
// node_modules/jose/dist/webapi/lib/jws_verify.js
function prepareVerify(options) {
	return [options && validateAlgorithms("algorithms", options.algorithms), options?.crit];
}
function parseProtectedHeader(encodedProtectedHeader) {
	return encodedProtectedHeader === void 0 ? {} : parseJoseHeader(encodedProtectedHeader, JWSInvalid, "JWS Protected Header is invalid");
}
function encodeCompactUnencodedPayload(payload) {
	try {
		return encode(payload);
	} catch (cause) {
		throw new JWSInvalid("JWS Compact Serialization payload must use only ASCII characters", { cause });
	}
}
async function verifySignature(jws, shared, key, encodeUnencodedPayload, parsedProtected) {
	const { protected: encodedProtectedHeader, header, payload: inputPayload } = jws, protectedHeader = parsedProtected ?? parseProtectedHeader(encodedProtectedHeader);
	if (!isDisjoint(protectedHeader, header)) throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
	const joseHeader = {
		...protectedHeader,
		...header
	}, b64 = validateB64(protectedHeader, validateCrit(JWSInvalid, JWS_RECOGNIZED, shared[1], protectedHeader, joseHeader)), { alg } = joseHeader;
	if (typeof alg != "string" || !alg) throw new JWSInvalid("JWS \"alg\" (Algorithm) Header Parameter missing or invalid");
	if (shared[0] && !shared[0].has(alg)) throw new JOSEAlgNotAllowed("\"alg\" (Algorithm) Header Parameter value not allowed");
	if (b64) {
		if (typeof inputPayload != "string") throw new JWSInvalid("JWS Payload must be a string");
	} else if (typeof inputPayload != "string" && !(inputPayload instanceof Uint8Array)) throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
	const signingPayload = b64 || typeof inputPayload != "string" ? inputPayload : encodeUnencodedPayload(inputPayload);
	let resolvedKey = !1;
	typeof key == "function" && (key = await key(protectedHeader, jws), resolvedKey = !0);
	const entry = jwsAlgorithm(alg), signingInput = concat(encodedProtectedHeader !== void 0 ? encode(encodedProtectedHeader) : /* @__PURE__ */ new Uint8Array(), encode("."), typeof signingPayload == "string" ? shared[2] ??= encodeAsciiMember(signingPayload, "payload", JWSInvalid) : signingPayload), signature = decodeBase64url(jws.signature, "signature", JWSInvalid), verificationKey = await prepareKey(entry, key, "verify"), cryptoKey = await rawKey(verificationKey, entry.subtle, "verify");
	entry.minRsaBits && checkModulusLength(entry.alg, cryptoKey);
	let verified = !1;
	try {
		verified = await crypto.subtle.verify(entry.signing, cryptoKey, signature, signingInput);
	} catch (cause) {
		throw new JWSSignatureVerificationFailed(void 0, { cause });
	}
	if (!verified) throw new JWSSignatureVerificationFailed();
	const result = { payload: typeof signingPayload == "string" ? decodeBase64url(signingPayload, "payload", JWSInvalid) : signingPayload };
	return encodedProtectedHeader !== void 0 && (result.protectedHeader = protectedHeader), header !== void 0 && (result.unprotectedHeader = header), resolvedKey ? [{
		...result,
		key: verificationKey
	}, b64] : [result, b64];
}
async function verifyCompact(jws, shared, key) {
	if (jws instanceof Uint8Array && (jws = decoder.decode(jws)), typeof jws != "string") throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
	const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
	if (length !== 3) throw new JWSInvalid("Invalid Compact JWS");
	return verifySignature({
		payload,
		protected: protectedHeader,
		signature
	}, shared, key, encodeCompactUnencodedPayload);
}
// node_modules/jose/dist/webapi/lib/jwt_claims_set.js
const epoch = (date) => Math.floor(date.getTime() / 1e3);
const multipliers = {
	s: 1,
	m: 60,
	h: 3600,
	d: 86400,
	w: 604800,
	y: 31557600
};
const REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
const checkFailed = "check_failed";
function invalidDuration() {
	throw new TypeError("Invalid time period format");
}
function secs(str) {
	typeof str != "string" && invalidDuration();
	const matched = REGEX.exec(str);
	(!matched || matched[4] && matched[1]) && invalidDuration();
	const value = parseFloat(matched[2]), durationSeconds = Math.round(value * multipliers[matched[3][0].toLowerCase()]);
	return Number.isFinite(durationSeconds) || invalidDuration(), matched[1] === "-" || matched[4] === "ago" ? -durationSeconds : durationSeconds;
}
function validateInput(label, input) {
	if (!Number.isFinite(input)) throw new TypeError(`Invalid ${label} input`);
	return input;
}
const normalizeTyp = (value) => {
	const normalized = value.toLowerCase();
	return value.includes("/") ? normalized : `application/${normalized}`;
};
const checkAudiencePresence = (audPayload, audOption) => typeof audPayload == "string" ? audOption.includes(audPayload) : Array.isArray(audPayload) ? audOption.some((aud) => audPayload.includes(aud)) : !1;
function validateNumericDate(claimsSet, claim, required = !1) {
	const value = claimsSet[claim];
	if (!(value === void 0 && !required)) {
		if (typeof value != "number") throw new JWTClaimValidationFailed(`"${claim}" claim must be a number`, claimsSet, claim, "invalid");
		return value;
	}
}
function unexpectedClaim(claimsSet, claim) {
	throw new JWTClaimValidationFailed(`unexpected "${claim}" claim value`, claimsSet, claim, checkFailed);
}
function validateClaimsSet(protectedHeader, claimsSetBytes, options = {}) {
	let claimsSet;
	try {
		claimsSet = JSON.parse(strictDecoder.decode(claimsSetBytes));
	} catch (cause) {
		throw new JWTInvalid("JWT Claims Set must be a top-level JSON object", { cause });
	}
	if (!isObject(claimsSet)) throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
	const { typ } = options;
	if (typ !== void 0 && (typeof protectedHeader.typ != "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ))) throw new JWTClaimValidationFailed("unexpected \"typ\" JWT header value", claimsSet, "typ", checkFailed);
	const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options, presenceCheck = [...requiredClaims];
	maxTokenAge !== void 0 && presenceCheck.push("iat"), audience !== void 0 && presenceCheck.push("aud"), subject !== void 0 && presenceCheck.push("sub"), issuer !== void 0 && presenceCheck.push("iss");
	for (const claim of new Set(presenceCheck.reverse())) if (!Object.hasOwn(claimsSet, claim)) throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, claimsSet, claim, "missing");
	issuer !== void 0 && !(Array.isArray(issuer) ? issuer : [issuer]).includes(claimsSet.iss) && unexpectedClaim(claimsSet, "iss"), subject !== void 0 && claimsSet.sub !== subject && unexpectedClaim(claimsSet, "sub"), audience !== void 0 && !checkAudiencePresence(claimsSet.aud, typeof audience == "string" ? [audience] : audience) && unexpectedClaim(claimsSet, "aud");
	const { clockTolerance } = options;
	let tolerance = 0;
	if (typeof clockTolerance == "string") tolerance = secs(clockTolerance);
	else if (clockTolerance !== void 0) {
		if (typeof clockTolerance != "number") throw new TypeError("Invalid clockTolerance option type");
		tolerance = clockTolerance;
	}
	if (validateInput("clockTolerance option", tolerance), tolerance < 0) throw new TypeError("Invalid clockTolerance option input");
	const { currentDate } = options, now = validateInput("currentDate option", epoch(currentDate === void 0 ? /* @__PURE__ */ new Date() : currentDate)), iat = validateNumericDate(claimsSet, "iat", maxTokenAge !== void 0), nbf = validateNumericDate(claimsSet, "nbf");
	if (nbf !== void 0 && nbf > now + tolerance) throw new JWTClaimValidationFailed("\"nbf\" claim timestamp check failed", claimsSet, "nbf", checkFailed);
	const exp = validateNumericDate(claimsSet, "exp");
	if (exp !== void 0 && exp <= now - tolerance) throw new JWTExpired("\"exp\" claim timestamp check failed", claimsSet, "exp", checkFailed);
	if (maxTokenAge !== void 0) {
		const age = now - iat, max = validateInput("maxTokenAge option", typeof maxTokenAge == "number" ? maxTokenAge : secs(maxTokenAge));
		if (max < 0) throw new TypeError("Invalid maxTokenAge option input");
		if (age - tolerance > max) throw new JWTExpired("\"iat\" claim timestamp check failed (too far in the past)", claimsSet, "iat", checkFailed);
		if (age < -tolerance) throw new JWTClaimValidationFailed("\"iat\" claim timestamp check failed (it should be in the past)", claimsSet, "iat", checkFailed);
	}
	return claimsSet;
}
// node_modules/jose/dist/webapi/jwt/verify.js
async function jwtVerify(jwt, key, options) {
	const [verified, b64] = await verifyCompact(jwt, prepareVerify(options), key);
	if (!b64) throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
	const payload = validateClaimsSet(verified.protectedHeader, verified.payload, options);
	return {
		...verified,
		payload
	};
}
// node_modules/jose/dist/webapi/jwks/local.js
function isUsableJWK(jwk, entry, alg, kid) {
	const { kty, key_ops: keyOps, ext, kid: jwkKid, alg: jwkAlg, use, crv } = jwk;
	return (ext === void 0 || typeof ext == "boolean") && (keyOps === void 0 || Array.isArray(keyOps) && keyOps.every((operation, index) => typeof operation == "string" && keyOps.indexOf(operation) === index) && keyOps.includes("verify")) && entry.kty.includes(kty) && (kid === void 0 || typeof kid == "string" && kid === jwkKid) && (jwkAlg === void 0 ? kty !== "AKP" : alg === jwkAlg) && (use === void 0 || use === "sig") && (!entry.crv || crv === entry.crv);
}
async function importWithAlgCache(cache, jwk, entry) {
	const cached = cache.get(jwk) || cache.set(jwk, {}).get(jwk), { alg } = entry;
	if (cached[alg] === void 0) {
		const pending = jwkToKey(entry, jwk, !0).then((key) => {
			if (key.type !== "public") throw new JWKSInvalid("JSON Web Key Set members must be public keys");
			return cached[alg] = key, key;
		}).catch((error) => {
			throw cached[alg] === pending && delete cached[alg], error;
		});
		cached[alg] = pending;
	}
	return cached[alg];
}
function createLocalJWKSet(jwks) {
	let snapshot;
	try {
		snapshot = structuredClone(jwks);
	} catch (cause) {
		throw new JWKSInvalid("JSON Web Key Set malformed", { cause });
	}
	if (!isJwkSet(snapshot)) throw new JWKSInvalid("JSON Web Key Set malformed");
	const metadata = snapshot.keys.map((jwk) => {
		const normalized = snapshotJwk(jwk);
		return Array.isArray(normalized.key_ops) && (normalized.key_ops = [...normalized.key_ops]), normalized;
	}), cached = /* @__PURE__ */ new WeakMap();
	return Object.defineProperty(async (protectedHeader, token) => {
		const { alg, kid } = {
			...protectedHeader,
			...token?.header
		}, entry = typeof alg == "string" ? JWS[alg] : void 0;
		if (!entry || entry.secret) throw new JOSENotSupported("Unsupported \"alg\" value for a JSON Web Key Set");
		const candidates = snapshot.keys.filter((_, index) => isUsableJWK(metadata[index], entry, alg, kid)), { 0: jwk, length } = candidates;
		if (!length) throw new JWKSNoMatchingKey();
		if (length !== 1) {
			const error = new JWKSMultipleMatchingKeys();
			throw error[Symbol.asyncIterator] = async function* () {
				for (const jwk2 of candidates) try {
					yield await importWithAlgCache(cached, jwk2, entry);
				} catch {}
			}, error;
		}
		return importWithAlgCache(cached, jwk, entry);
	}, "jwks", { value: () => structuredClone(snapshot) });
}
// node_modules/jose/dist/webapi/jwks/remote.js
function isCloudflareWorkers() {
	return typeof WebSocketPair < "u" || typeof navigator < "u" && navigator.userAgent === "Cloudflare-Workers" || typeof EdgeRuntime < "u" && EdgeRuntime === "vercel";
}
let USER_AGENT;
(typeof navigator > "u" || !navigator.userAgent?.startsWith?.("Mozilla/5.0 ")) && (USER_AGENT = "jose/v6.2.17");
const customFetch = /* @__PURE__ */ Symbol();
async function fetchJwks(url, headers, signal, fetchImpl = fetch) {
	const response = await fetchImpl(url, {
		method: "GET",
		signal,
		redirect: "manual",
		headers
	}).catch((err) => {
		throw err.name === "TimeoutError" ? new JWKSTimeout(void 0, { cause: err }) : err;
	});
	if (response.status !== 200) throw new JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response");
	try {
		return await response.json();
	} catch (cause) {
		throw new JOSEError("Failed to parse the JSON Web Key Set HTTP response as JSON", { cause });
	}
}
const jwksCache = /* @__PURE__ */ Symbol();
function isFreshFor(timestamp, duration) {
	return Number.isFinite(timestamp) && Date.now() < timestamp + duration;
}
function validateDuration(value, fallback, option) {
	if (Number.isNaN(value)) throw new TypeError(`"${option}" option must not be NaN`);
	if (typeof value == "number" && value < 0) throw new TypeError(`"${option}" option must not be negative`);
	return typeof value == "number" ? value : fallback;
}
function createRemoteJWKSet(url, options) {
	if (!(url instanceof URL)) throw new TypeError("url must be an instance of URL");
	const href = new URL(url.href).href, opts = options ?? {}, timeoutOption = opts.timeoutDuration;
	if (typeof timeoutOption == "number" && (!Number.isInteger(timeoutOption) || timeoutOption < 0)) throw new TypeError("\"timeoutDuration\" option must be a non-negative integer");
	const timeoutDuration = typeof timeoutOption == "number" ? timeoutOption : 5e3, cooldownDuration = validateDuration(opts.cooldownDuration, 3e4, "cooldownDuration"), cacheMaxAge = validateDuration(opts.cacheMaxAge, 6e5, "cacheMaxAge"), headers = new Headers(opts.headers);
	USER_AGENT && !headers.has("User-Agent") && headers.set("User-Agent", USER_AGENT), headers.has("accept") || headers.set("accept", "application/json, application/jwk-set+json");
	const fetchImpl = opts[customFetch], cache = opts[jwksCache];
	let jwksTimestamp, pendingFetch, reloadSequence = 0, appliedSequence = 0, local;
	if (cache && typeof cache == "object") {
		const { uat, jwks } = cache;
		isFreshFor(uat, cacheMaxAge) && isJwkSet(jwks) && (jwksTimestamp = uat, local = createLocalJWKSet(jwks));
	}
	const reload = async () => {
		if (pendingFetch && isCloudflareWorkers() && (pendingFetch = void 0), !pendingFetch) {
			const sequence = ++reloadSequence, current = pendingFetch = fetchJwks(href, headers, AbortSignal.timeout(timeoutDuration), fetchImpl).then((json) => {
				const next = createLocalJWKSet(json);
				if (sequence <= appliedSequence) return;
				local = next;
				const updatedAt = Date.now();
				cache && (cache.uat = updatedAt, cache.jwks = json), jwksTimestamp = updatedAt, appliedSequence = sequence;
			}).finally(() => {
				pendingFetch === current && (pendingFetch = void 0);
			});
		}
		await pendingFetch;
	};
	return Object.defineProperties(async (protectedHeader, token) => {
		(!local || !isFreshFor(jwksTimestamp, cacheMaxAge)) && await reload();
		try {
			return await local(protectedHeader, token);
		} catch (err) {
			if (err instanceof JWKSNoMatchingKey && !isFreshFor(jwksTimestamp, cooldownDuration)) return await reload(), local(protectedHeader, token);
			throw err;
		}
	}, {
		coolingDown: {
			get: () => isFreshFor(jwksTimestamp, cooldownDuration),
			enumerable: !0
		},
		fresh: {
			get: () => isFreshFor(jwksTimestamp, cacheMaxAge),
			enumerable: !0
		},
		reload: {
			value: reload,
			enumerable: !0
		},
		reloading: {
			get: () => !!pendingFetch,
			enumerable: !0
		},
		jwks: {
			value: () => local?.jwks(),
			enumerable: !0
		}
	});
}
const AUTH_ROUTE_PREFIX = "/auth/freebuff";
const TRANSACTION_TTL = 600;
const SESSION_COOKIE_TTL = 2592e3;
const REFRESH_SKEW_SECONDS = 30;
const MAX_COOKIE_LENGTH = 4e3;
const FETCH_TIMEOUT_MS = 8e3;
const LOOPBACK = /* @__PURE__ */ new Set([
	"localhost",
	"127.0.0.1",
	"[::1]"
]);
const ALL_SCOPES = [
	"openid",
	"email",
	"profile"
];
const PROMPTS = /* @__PURE__ */ new Set([
	"login",
	"consent",
	"select_account"
]);
const NO_STORE = {
	"Cache-Control": "private, no-store",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff"
};
function checkedUrl(value, allowLoopback, what) {
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${what} must be an absolute URL.`);
	}
	const loopbackHttp = allowLoopback && LOOPBACK.has(url.hostname) && url.protocol === "http:";
	if (url.protocol !== "https:" && !loopbackHttp || url.username || url.password || url.search || url.hash) throw new Error(`${what} must be an https URL without credentials, query or fragment (http is allowed only for localhost with allowInsecureLocalhost).`);
	return url;
}
function base64url(bytes) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomToken() {
	return base64url(crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(32)));
}
async function pkceChallenge(verifier) {
	const bytes = new TextEncoder().encode(verifier);
	const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
	return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)));
}
/**
* Same-origin check for state-changing browser requests. A page served with
* `Referrer-Policy: no-referrer` posts `Origin: null` even to itself;
* `Sec-Fetch-Site` is browser-set and cannot be forged by page script.
*/
function isSameOriginRequest(request, origin) {
	const header = request.headers.get("origin");
	if (header && header !== "null") return header === origin;
	return request.headers.get("sec-fetch-site") === "same-origin";
}
function timingSafeEqual(left, right) {
	if (left.length !== right.length) return false;
	let diff = 0;
	for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
	return diff === 0;
}
/** Ambiguous (duplicated) cookies read as absent: fail closed. */
function readCookie(header, name) {
	const values = (header ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
	if (values.length !== 1) return null;
	const value = values[0].slice(name.length + 1);
	return value && value.length <= MAX_COOKIE_LENGTH ? value : null;
}
/** A same-origin path, never another origin or one of the auth routes. */
function safeReturnTo(value) {
	if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
	const base = "https://return-to.invalid";
	let url;
	try {
		url = new URL(value, base);
	} catch {
		return "/";
	}
	if (url.origin !== base || url.pathname === "/auth/freebuff" || url.pathname.startsWith(`/auth/freebuff/`)) return "/";
	return `${url.pathname}${url.search}${url.hash}`;
}
function userFrom(claims, scopes) {
	if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) return null;
	const user = { sub: claims.sub };
	if (scopes.includes("email")) {
		if (typeof claims.email === "string" && claims.email.length <= 320) user.email = claims.email;
		if (typeof claims.email_verified === "boolean") user.email_verified = claims.email_verified;
	}
	if (scopes.includes("profile")) {
		if (typeof claims.name === "string" && claims.name.length <= 200) user.name = claims.name;
		if (typeof claims.picture === "string" && claims.picture.startsWith("https://") && claims.picture.length <= 1024) user.picture = claims.picture;
	}
	return user;
}
function json$1(body, status = 200, cookies = []) {
	const headers = new Headers({
		...NO_STORE,
		"Content-Type": "application/json; charset=utf-8"
	});
	for (const cookie of cookies) headers.append("Set-Cookie", cookie);
	return new Response(JSON.stringify(body), {
		status,
		headers
	});
}
function redirect(location, cookies = []) {
	const headers = new Headers({
		...NO_STORE,
		Location: location
	});
	for (const cookie of cookies) headers.append("Set-Cookie", cookie);
	return new Response(null, {
		status: 303,
		headers
	});
}
function problem(status, message, cookies = []) {
	const headers = new Headers({
		...NO_STORE,
		"Content-Type": "text/plain; charset=utf-8"
	});
	for (const cookie of cookies) headers.append("Set-Cookie", cookie);
	return new Response(message, {
		status,
		headers
	});
}
async function readJson(response) {
	const text = await response.text();
	if (text.length > 65536) throw new Error("Freebuff response too large");
	const value = JSON.parse(text);
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected Freebuff response");
	return value;
}
function createFreebuffAuth(options) {
	const allowLoopback = options.allowInsecureLocalhost === true;
	const issuer = (options.issuer ?? "https://freebuff.com/oidc").replace(/\/$/, "");
	const issuerUrl = checkedUrl(issuer, allowLoopback, "issuer");
	const base = checkedUrl(options.baseUrl, allowLoopback, "baseUrl");
	if (base.pathname !== "/") throw new Error("baseUrl must be an origin, without a path.");
	const origin = base.origin;
	const clientId = options.clientId;
	if (!/^[A-Za-z0-9_-]{1,200}$/.test(clientId ?? "")) throw new Error("clientId is missing or malformed; use the ID from Freebuff provisioning.");
	const scopes = ALL_SCOPES.filter((scope) => scope === "openid" || (options.scopes ?? ALL_SCOPES).includes(scope));
	const now = options.now ?? Date.now;
	const fetcher = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
	const secure = base.protocol === "https:";
	const cookiePrefix = secure ? "__Host-" : "";
	const sessionCookie = `${cookiePrefix}freebuff_session`;
	const transactionCookie = (state) => `${cookiePrefix}freebuff_txn-${state.slice(0, 16)}`;
	const callbackUrl = `${origin}${AUTH_ROUTE_PREFIX}/callback`;
	const setCookie = (name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
	const clearCookie = (name) => setCookie(name, "", 0);
	const sessionCookieFor = (session) => {
		const value = `v1~${session.accessToken}~${session.refreshToken}`;
		if (value.length > MAX_COOKIE_LENGTH) throw new Error("Freebuff session is too large for a cookie");
		return setCookie(sessionCookie, value, SESSION_COOKIE_TTL);
	};
	async function freebuffFetch(input, init = {}) {
		const response = await fetcher(input, {
			...init,
			redirect: "manual",
			credentials: "omit",
			signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS)
		});
		if (response.status >= 300 && response.status < 400) {
			await response.body?.cancel();
			throw new Error("Freebuff endpoint returned a redirect");
		}
		return response;
	}
	let discovery;
	function endpoints() {
		discovery ??= (async () => {
			const response = await freebuffFetch(`${issuer}/.well-known/openid-configuration`, { headers: { accept: "application/json" } });
			if (!response.ok) throw new Error(`Freebuff discovery failed: ${response.status}`);
			const document = await readJson(response);
			if (document.issuer !== issuer) throw new Error("Freebuff discovery named a different issuer");
			const endpoint = (name, required = true) => {
				const value = document[name];
				if (typeof value !== "string") {
					if (required) throw new Error(`Freebuff discovery is missing ${name}`);
					return null;
				}
				const url = checkedUrl(value, allowLoopback, name);
				if (url.origin !== issuerUrl.origin) throw new Error(`Freebuff ${name} left the issuer origin`);
				return url.href;
			};
			return {
				authorization: endpoint("authorization_endpoint"),
				token: endpoint("token_endpoint"),
				revocation: endpoint("revocation_endpoint", false),
				keys: createRemoteJWKSet(new URL(endpoint("jwks_uri")), {
					[customFetch]: (url, init) => freebuffFetch(url, init),
					timeoutDuration: FETCH_TIMEOUT_MS
				})
			};
		})().catch((error) => {
			discovery = void 0;
			throw error;
		});
		return discovery;
	}
	function readSession(request) {
		const value = readCookie(request.headers.get("cookie"), sessionCookie);
		const match = value ? /^v1~([A-Za-z0-9._-]+)~(fbrt_[A-Za-z0-9_-]+)$/.exec(value) : null;
		return match ? {
			accessToken: match[1],
			refreshToken: match[2]
		} : null;
	}
	async function verifyAccessToken(token) {
		try {
			const { payload } = await jwtVerify(token, (await endpoints()).keys, {
				issuer,
				audience: clientId,
				algorithms: ["RS256"],
				typ: "at+jwt",
				requiredClaims: [
					"sub",
					"exp",
					"iat",
					"client_id"
				],
				clockTolerance: 5,
				currentDate: new Date(now())
			});
			if (payload.client_id !== clientId) return null;
			const user = userFrom(payload, scopes);
			if (!user) return null;
			if (payload.exp <= Math.floor(now() / 1e3) + REFRESH_SKEW_SECONDS) return "expired";
			return {
				user,
				expiresAt: payload.exp
			};
		} catch (error) {
			return error instanceof JWTExpired ? "expired" : null;
		}
	}
	/** New tokens, `invalid` (the session is over), or `unavailable` (try again later). */
	async function refresh(refreshToken) {
		let response;
		try {
			response = await freebuffFetch((await endpoints()).token, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					accept: "application/json"
				},
				body: new URLSearchParams({
					grant_type: "refresh_token",
					client_id: clientId,
					refresh_token: refreshToken
				})
			});
		} catch {
			return "unavailable";
		}
		const body = await readJson(response).catch(() => null);
		if (!response.ok) return body?.error === "invalid_grant" || body?.error === "invalid_client" ? "invalid" : "unavailable";
		if (typeof body?.access_token !== "string" || typeof body.refresh_token !== "string") return "unavailable";
		const verified = await verifyAccessToken(body.access_token);
		if (!verified || verified === "expired") return "unavailable";
		return {
			accessToken: body.access_token,
			refreshToken: body.refresh_token,
			user: verified.user
		};
	}
	async function authenticate(request) {
		const session = readSession(request);
		if (!session) return {
			user: null,
			cookies: []
		};
		const verified = await verifyAccessToken(session.accessToken);
		if (verified && verified !== "expired") return {
			user: verified.user,
			cookies: []
		};
		if (verified === null) return {
			user: null,
			cookies: []
		};
		const refreshed = await refresh(session.refreshToken);
		if (refreshed === "invalid") return {
			user: null,
			cookies: [clearCookie(sessionCookie)]
		};
		if (refreshed === "unavailable") return {
			user: null,
			cookies: []
		};
		return {
			user: refreshed.user,
			cookies: [sessionCookieFor(refreshed)]
		};
	}
	const contexts = /* @__PURE__ */ new WeakMap();
	async function getUser(request) {
		const context = contexts.get(request);
		if (context) {
			context.result ??= authenticate(request);
			return (await context.result).user;
		}
		const session = readSession(request);
		if (!session) return null;
		const verified = await verifyAccessToken(session.accessToken);
		return verified && verified !== "expired" ? verified.user : null;
	}
	async function signIn(url) {
		let authorization;
		try {
			authorization = (await endpoints()).authorization;
		} catch {
			return problem(503, "Sign in with Freebuff is temporarily unavailable. Please try again.");
		}
		const state = randomToken();
		const nonce = randomToken();
		const verifier = randomToken();
		const target = new URL(authorization);
		target.search = new URLSearchParams({
			response_type: "code",
			client_id: clientId,
			redirect_uri: callbackUrl,
			scope: scopes.join(" "),
			state,
			nonce,
			code_challenge: await pkceChallenge(verifier),
			code_challenge_method: "S256"
		}).toString();
		const prompt = url.searchParams.get("prompt");
		if (prompt && PROMPTS.has(prompt)) target.searchParams.set("prompt", prompt);
		const transaction = base64url(new TextEncoder().encode(JSON.stringify({
			s: state,
			n: nonce,
			v: verifier,
			r: safeReturnTo(url.searchParams.get("returnTo"))
		})));
		return redirect(target.href, [setCookie(transactionCookie(state), transaction, TRANSACTION_TTL)]);
	}
	function readTransaction(request, state) {
		const raw = readCookie(request.headers.get("cookie"), transactionCookie(state));
		if (!raw) return null;
		try {
			const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
			const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))));
			if (typeof decoded.s !== "string" || typeof decoded.n !== "string" || typeof decoded.v !== "string" || !timingSafeEqual(decoded.s, state)) return null;
			return {
				nonce: decoded.n,
				verifier: decoded.v,
				returnTo: safeReturnTo(typeof decoded.r === "string" ? decoded.r : "/")
			};
		} catch {
			return null;
		}
	}
	async function callback(request, url) {
		const params = url.searchParams;
		const state = params.get("state") ?? "";
		if (!/^[A-Za-z0-9_-]{43}$/.test(state) || [...params.keys()].some((key) => params.getAll(key).length > 1)) return problem(400, "This sign-in link is invalid. Please sign in again.");
		const transaction = readTransaction(request, state);
		const clearTransaction = clearCookie(transactionCookie(state));
		if (!transaction) return problem(400, "This sign-in expired or was started in another browser. Please sign in again.", [clearTransaction]);
		if (params.get("iss") !== issuer) return problem(400, "Sign-in response came from an unexpected issuer.", [clearTransaction]);
		const error = params.get("error");
		if (error) {
			if (error === "access_denied") return redirect(transaction.returnTo, [clearTransaction]);
			return problem(400, "Sign in with Freebuff did not complete. Please try again.", [clearTransaction]);
		}
		const code = params.get("code");
		if (!code || code.length > 512) return problem(400, "This sign-in link is invalid. Please sign in again.", [clearTransaction]);
		try {
			const { token, keys } = await endpoints();
			const response = await freebuffFetch(token, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					accept: "application/json"
				},
				body: new URLSearchParams({
					grant_type: "authorization_code",
					client_id: clientId,
					code,
					redirect_uri: callbackUrl,
					code_verifier: transaction.verifier
				})
			});
			const tokens = await readJson(response);
			if (!response.ok || typeof tokens.id_token !== "string" || typeof tokens.access_token !== "string" || typeof tokens.refresh_token !== "string") throw new Error("token exchange failed");
			const { payload } = await jwtVerify(tokens.id_token, keys, {
				issuer,
				audience: clientId,
				algorithms: ["RS256"],
				requiredClaims: [
					"sub",
					"exp",
					"iat",
					"nonce"
				],
				maxTokenAge: TRANSACTION_TTL,
				clockTolerance: 5,
				currentDate: new Date(now())
			});
			if (typeof payload.nonce !== "string" || !timingSafeEqual(payload.nonce, transaction.nonce) || payload.azp !== void 0 && payload.azp !== clientId) throw new Error("ID token is not bound to this sign-in");
			const access = await verifyAccessToken(tokens.access_token);
			if (!access || access === "expired" || access.user.sub !== payload.sub) throw new Error("access token does not match the ID token");
			return redirect(transaction.returnTo, [sessionCookieFor({
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token
			}), clearTransaction]);
		} catch {
			return problem(400, "Sign in with Freebuff could not be completed. Please try again.", [clearTransaction]);
		}
	}
	async function signOut(request, url) {
		if (!isSameOriginRequest(request, origin)) return problem(403, "Sign-out must be submitted from this site.");
		const session = readSession(request);
		if (session) try {
			const { revocation } = await endpoints();
			if (revocation) await freebuffFetch(revocation, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					client_id: clientId,
					token: session.refreshToken,
					token_type_hint: "refresh_token"
				})
			});
		} catch {}
		let returnTo = url.searchParams.get("returnTo");
		const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
		if (!returnTo && type === "application/x-www-form-urlencoded") {
			const text = await request.text().catch(() => "");
			if (text.length <= 4096) returnTo = new URLSearchParams(text).get("returnTo");
		}
		return redirect(safeReturnTo(returnTo), [clearCookie(sessionCookie)]);
	}
	async function handle(request) {
		const url = new URL(request.url);
		if (!url.pathname.startsWith(`/auth/freebuff/`)) return null;
		const route = url.pathname.slice(14);
		const method = request.method;
		switch (route) {
			case "/signin": return method === "GET" ? signIn(url) : problem(405, "Use GET.");
			case "/callback": return method === "GET" ? callback(request, url) : problem(405, "Use GET.");
			case "/signout": return method === "POST" ? signOut(request, url) : problem(405, "Use POST.");
			case "/session": {
				if (method !== "GET") return problem(405, "Use GET.");
				const { user, cookies } = await authenticate(request);
				return json$1({ user }, 200, cookies);
			}
			default: return null;
		}
	}
	function wrap(handler) {
		return async (request, ...rest) => {
			const own = await handle(request);
			if (own) return own;
			const context = {};
			contexts.set(request, context);
			const response = await handler(request, ...rest);
			const cookies = context.result ? (await context.result).cookies : [];
			if (cookies.length === 0 || response.status === 101) return response;
			const headers = new Headers(response.headers);
			for (const cookie of cookies) headers.append("Set-Cookie", cookie);
			headers.set("Cache-Control", "private, no-store");
			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers
			});
		};
	}
	return {
		issuer,
		clientId,
		handle,
		authenticate,
		getUser,
		wrap
	};
}
// deploy/worker.src.js
/**
* RPG Map Editor server: Sign in with Freebuff, plus per-account map saves in
* the site's D1 database. Everything else is the static Vite build.
*/
const MAX_MAP_BYTES = 15e5;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
let cachedAuth = null;
function getAuth(env) {
	if (!cachedAuth) cachedAuth = createFreebuffAuth({
		clientId: env.FREEBUFF_CLIENT_ID,
		issuer: env.FREEBUFF_ISSUER,
		baseUrl: env.APP_ORIGIN
	});
	return cachedAuth;
}
function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "private, no-store"
		}
	});
}
let schemaReady = false;
async function ensureSchema(env) {
	if (schemaReady) return;
	await env.DB.prepare(`CREATE TABLE IF NOT EXISTS maps (
       user_id TEXT NOT NULL,
       id TEXT NOT NULL,
       name TEXT NOT NULL,
       cols INTEGER NOT NULL,
       rows INTEGER NOT NULL,
       data TEXT NOT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY (user_id, id)
     )`).run();
	schemaReady = true;
}
async function handleApi(request, env, auth) {
	const user = await auth.getUser(request);
	if (!user) return json({ error: "Sign in required" }, 401);
	await ensureSchema(env);
	const match = new URL(request.url).pathname.match(/^\/api\/maps(?:\/([^/]+))?$/);
	if (!match) return json({ error: "Not found" }, 404);
	const id = match[1] ? decodeURIComponent(match[1]) : null;
	if (id && !ID_PATTERN.test(id)) return json({ error: "Bad map id" }, 400);
	if (request.method === "GET") {
		if (!id) {
			const { results } = await env.DB.prepare("SELECT id, name, cols, rows, updated_at FROM maps WHERE user_id = ? ORDER BY updated_at DESC").bind(user.sub).all();
			return json({ maps: results ?? [] });
		}
		const row = await env.DB.prepare("SELECT id, name, cols, rows, data, updated_at FROM maps WHERE user_id = ? AND id = ?").bind(user.sub, id).first();
		if (!row) return json({ error: "Map not found" }, 404);
		return json({ map: row });
	}
	if (!isSameOriginRequest(request, env.APP_ORIGIN)) return json({ error: "Forbidden" }, 403);
	if (request.method === "PUT" && id) {
		const text = await request.text();
		if (text.length > MAX_MAP_BYTES) return json({ error: "That map is too large to save." }, 413);
		let body = null;
		try {
			body = JSON.parse(text);
		} catch {
			return json({ error: "Invalid map payload" }, 400);
		}
		if (!body || typeof body.name !== "string" || typeof body.cols !== "number" || typeof body.rows !== "number" || !body.data || typeof body.data !== "object") return json({ error: "Invalid map payload" }, 400);
		const name = body.name.trim().slice(0, 120) || "Untitled map";
		const cols = Math.min(500, Math.max(1, Math.round(body.cols)));
		const rows = Math.min(500, Math.max(1, Math.round(body.rows)));
		const data = JSON.stringify(body.data);
		if (data.length > MAX_MAP_BYTES) return json({ error: "That map is too large to save." }, 413);
		const now = (/* @__PURE__ */ new Date()).toISOString();
		await env.DB.prepare(`INSERT INTO maps (user_id, id, name, cols, rows, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, id) DO UPDATE SET
         name = excluded.name,
         cols = excluded.cols,
         rows = excluded.rows,
         data = excluded.data,
         updated_at = excluded.updated_at`).bind(user.sub, id, name, cols, rows, data, now, now).run();
		return json({
			ok: true,
			id,
			updatedAt: now
		});
	}
	if (request.method === "DELETE" && id) {
		await env.DB.prepare("DELETE FROM maps WHERE user_id = ? AND id = ?").bind(user.sub, id).run();
		return json({ ok: true });
	}
	return json({ error: "Method not allowed" }, 405);
}
var worker_src_default = { async fetch(request, env, ctx) {
	const auth = getAuth(env);
	return auth.wrap(async (req) => {
		if (new URL(req.url).pathname.startsWith("/api/")) return handleApi(req, env, auth);
		return env.ASSETS.fetch(req);
	})(request, env, ctx);
} };
export { worker_src_default as default };
