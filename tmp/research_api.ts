import axios from 'axios';

async function run() {
  const urls = [
    'https://www.moltbook.com/api/v1/',
    'https://www.moltbook.com/api/v1/docs',
    'https://www.moltbook.com/api/v1/openapi.json',
    'https://www.moltbook.com/api/v1/help'
  ];

  for (const url of urls) {
    try {
      console.log(`\nFetching ${url}`);
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer moltbook_sk_jy5DHppMwtezKh5gIRl-uysmOiGr0IiB` },
        validateStatus: () => true
      });
      console.log(`Status: ${res.status}`);
      if (res.status === 200) {
        console.log(JSON.stringify(res.data, null, 2).substring(0, 1000));
      } else {
        console.log(JSON.stringify(res.data, null, 2).substring(0, 200));
      }
    } catch (e: any) {
      console.log('Error', e.message);
    }
  }
}
run();
