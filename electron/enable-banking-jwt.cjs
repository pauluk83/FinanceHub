'use strict';

const crypto = require('crypto');

/**
 * Short-lived RS256 JWT for Enable Banking. The header `kid` must be the
 * application ID and the payload must name Enable Banking as issuer/audience.
 */
function signEnableBankingJwt(appId, privateKey, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof appId !== 'string' || !appId) throw new Error('An Enable Banking application ID is required');
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const signingInput = `${encode({ typ: 'JWT', alg: 'RS256', kid: appId })}`
    + `.${encode({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: nowSeconds, exp: nowSeconds + 3600 })}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

module.exports = { signEnableBankingJwt };
