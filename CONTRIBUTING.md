## Prerequisites

1. Node 22+
2. Build tools for native modules (`sharp`, `zedd-win32`): on Windows, Visual Studio with the
   "Desktop development with C++" workload

```sh
git clone https://github.com/tobka777/zedd2.git
cd zedd

cd zedd-platform
npm install
npm run build

cd ..

cd zedd-app
npm install
npm run start
```

## For publishing - Prerequisites

1. Node 22+
2. Create a GithubToken at https://github.com/settings/tokens (select all repo permissions)
3. Customize changelog version and date

```sh
GITHUB_TOKEN=<YOUR_TOKEN>
export GITHUB_TOKEN

cd zedd-app

# alternatively minor instead of patch
npm version patch

git push --tags

npm run publish
```
