const axios = require('axios');
const AqaraError = require('../errors/aqara-error');
let _options = { rootUrl: 'https://aiot-open-3rd.aqara.cn/3rd/v1.0/open' };

/*
{
  "code": 0,
  "requestId": "1213.28561.xx",
  "message": "Success",
  "result": [
    {
      "time": "1573825115338",
      "attr": "temperature_value",
      "value": "2062",
      "did": "lumi.xxx"
    }
  ]
}
*/
async function query(did, attrs) {
  const url = `${_options.rootUrl}/resource/query`;
  const data = { data: [{ did, attrs }] };
  const headers = await _options.auth.getRequestHeaders();
  try {
    let resp = await axios.post(url, data, {
      headers: headers
    });
    return resp.data.result;
  }
  catch (error) {
    console.error('resource.query error:');
    console.error(error);
    throw new AqaraError('resource.query failed.', error);
  }
}

async function subscribe(did, attrs) {
  const url = `${_options.rootUrl}/subscriber/resource`;
  const data = {data: [{did,attrs}]};
  const headers = await _options.auth.getRequestHeaders();
  try {
    let resp = await axios.post(url, data, {
      headers: headers
    });
    return resp.data;
  }
  catch (error) {
    console.error('resource.subscribe error:');
    console.error(error);
    throw new AqaraError('resource.query failed.', error);
  }
}

function options(opts) {
  _options = Object.assign(_options, opts);
}


exports = module.exports = {
  options,
  query,
  subscribe
};
