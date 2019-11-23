# aqara-sdk
```js
// https://opencloud.aqara.cn/opencloud/api
const aqara = require('aqara-sdk');
aqara.oauth2.setCredentials({ clientId, clientSecret, account, password });
aqara.resource.options({ auth: aqara.oauth2 });
(async() => {
  const result = await aqara.resource.query(devId, attrs);
  await aqara.resource.subscribe(devId, attrs);
})();
```
