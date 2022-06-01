## Prerequisistes

1. Node 16+

```sh
git clone https://github.com/Andrej1b/zedd2.git
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

## For publishing - Prerequisistes

1. Node 16+
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
