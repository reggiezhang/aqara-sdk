const axios = require('axios');
const qs = require('qs');
const crypto = require('crypto');
const { URL } = require('url');
const AqaraError = require('../errors/aqara-error');

const AQARA_OAUTH2_BASE_URL_ = 'https://aiot-oauth2.aqara.cn';
const AQARA_OAUTH2_AUTH_URL_ = `${AQARA_OAUTH2_BASE_URL_}/authorize`;
const AQARA_OAUTH2_TOKEN_URL_ = `${AQARA_OAUTH2_BASE_URL_}/access_token`;
const EAGER_REFRESH_THRESHOLD_MILLIS_ = 12 * 60 * 60 * 1000; // 12 hours

let _tokens = {};

let _credentials = {};

function _validateOauthCreds() {
  if (!_credentials.clientId ||
    !_credentials.clientSecret ||
    !_credentials.redirectUrl) {
    throw new AqaraError('No clientId, clientSecret or redirectUrl is set.');
  }
}

function _validateResponse(resp) {
  if (resp.data.error && resp.data.error_description) {
    let err = new Error(resp.data.error_description);
    err.response = resp;
    throw err;
  }
}

function _hasToken() {
  return _tokens.access_token && _tokens.refresh_token;
}

function _clearToken() {
  _tokens = {};
}

function _errMsg(error) {
  let errMsg;
  try {
    errMsg = error.response.data.error || error.response.data.message;
  }
  catch (error) {
    console.error(error);
  }
  return errMsg;
}

function _generateSign(appId, appSecret, accessToken, timestamp) {
  let signStr = `accesstoken=${accessToken}&appid=${appId}&time=${timestamp}`;
  signStr = signStr.toLowerCase();
  signStr = `${signStr}&${appSecret}`;
  signStr = crypto.createHash('md5').update(signStr).digest("hex");
  return signStr;
}

/**
 * Returns true if a token is expired or will expire within
 * EAGER_REFRESH_THRESHOLD_MILLIS_ milliseconds.
 * If there is no expiry time, assumes the token is not expired or expiring.
 */
function _isTokenExpiring() {
  const expiryDate = _tokens.expiry_date;
  return expiryDate ?
    expiryDate <= new Date().getTime() + EAGER_REFRESH_THRESHOLD_MILLIS_ :
    false;
}
/*
{clientId, clientSecret, account, password}
*/
function setCredentials(credentials) {
  _credentials = Object.assign({ redirectUrl: 'urn:ietf:wg:oauth:2.0:oob:auto' }, credentials);
  _validateOauthCreds();
}

// Generate the authorize url that will be used for the consent dialog.
function generateAuthUrl() {
  _validateOauthCreds();
  const url = `${AQARA_OAUTH2_AUTH_URL_}?client_id=${_credentials.clientId}&response_type=code&redirect_uri=${_credentials.redirectUrl}`;
  return url;
}

// Acquiring authorization code through HTTP POST with additional account and password information,
// without interaction with UA.
// {"error_description":"INVALID client_id","error":"invalid_client"}
async function getCode() {
  if (!_credentials.account || !_credentials.password) {
    throw new AqaraError('Aqara account and password needed for getCode');
  }
  const state = Date.now();
  const url = `${generateAuthUrl()}&state=${state}`;
  const data = {
    account: _credentials.account,
    password: _credentials.password
  };
  try {
    let resp = await axios.post(url, qs.stringify(data), {
      maxRedirects: 0,
      validateStatus: function(status) {
        return status == 302;
      }
    });
    // console.log(resp.headers.location);
    const codeUrl = new URL(resp.headers.location);
    if (state != codeUrl.searchParams.get('state')) {
      throw new AqaraError('state miss match.');
    }
    const code = codeUrl.searchParams.get('code');
    console.info(`Code acquired: ${code}`);
    return code;
  }
  catch (error) {
    console.error('oauth2.getCode error:');
    console.error(error);
    throw new AqaraError('Cannot get authorize code.', error);
  }
}

// get access, refresh token by authorization code
async function getToken(code) {
  if (_hasToken() && !code) {
    return _tokens;
  }
  _clearToken();
  _validateOauthCreds();
  const state = Date.now();
  const url = AQARA_OAUTH2_TOKEN_URL_;
  const data = {
    client_id: _credentials.clientId,
    client_secret: _credentials.clientSecret,
    redirect_uri: _credentials.redirectUrl,
    grant_type: 'authorization_code',
    code: code,
    state: state
  };
  try {
    let resp = await axios.post(url, qs.stringify(data));
    _tokens = resp.data;
    if (state != _tokens.state) {
      throw new AqaraError('state miss match.');
    }
  }
  catch (error) {
    console.error('oauth2.getToken error:');
    console.error(error);
    throw new AqaraError('Cannot get authorize code.', error);
  }
  if (_tokens.expires_in) {
    _tokens.expiry_date = new Date().getTime() + _tokens.expires_in * 1000;
  }
  console.info(`Token acquired: ${JSON.stringify(_tokens)}`);
  return _tokens;
}
// { error_description: 'INVALID refresh_token', error: 'invalid_grant' }
async function refreshToken() {
  if (!_tokens.refresh_token) {
    throw new AqaraError('No refresh token is set.');
  }
  _validateOauthCreds();
  const url = AQARA_OAUTH2_TOKEN_URL_;
  const data = {
    client_id: _credentials.clientId,
    client_secret: _credentials.clientSecret,
    redirect_uri: _credentials.redirectUrl,
    grant_type: 'refresh_token',
    refresh_token: _tokens.refresh_token
  };
  try {
    let resp = await axios.post(url, qs.stringify(data));
    _validateResponse(resp);
    _tokens = resp.data;
  }
  catch (error) {
    console.error('oauth2.refreshToken error:');
    console.error(error);
    let errMsg = _errMsg(error);
    if ('invalid_grant' == errMsg) {
      _clearToken();
    }
    throw new AqaraError('Cannot refresh token.', error);
  }
  if (_tokens.expires_in) {
    _tokens.expiry_date = new Date().getTime() + _tokens.expires_in * 1000;
  }
  console.log(`Token refreshed: ${JSON.stringify(_tokens)}`);
  return _tokens;
}

async function getRequestHeaders() {
  if (_hasToken()) {
    _isTokenExpiring() && await refreshToken();
  }
  else {
    let code = await getCode();
    await getToken(code);
  }
  const timestamp = Date.now();
  const headers = {
    Appid: _credentials.clientId,
    Sign: _generateSign(_credentials.clientId, _credentials.clientSecret, _tokens.access_token, timestamp),
    Accesstoken: _tokens.access_token,
    Time: timestamp
  };
  return headers;
}

exports = module.exports = {
  setCredentials,
  generateAuthUrl,
  getCode,
  getToken,
  refreshToken,
  getRequestHeaders
};
