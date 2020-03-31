##Prerequisistes

1. Node 12+
2. Win 10 SDK (min (possibly exactly) Build 14393)
3. VC++ 2017 (if you get an error about a missing platform.winmd, try installing VC++ 2015 too)

```sh
git clone https://github.com/NaridaL/zedd.git
cd zedd

cd zedd-clarity
npm install
npm run build

cd ..

cd zedd-app
npm install
npm run genicons
npm run start
```
