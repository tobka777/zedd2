import which from 'async-which'
import { promisify } from 'util'
import { Extract } from 'unzipper'
import { withDir as withTmpDir } from 'tmp-promise'
import { exec } from 'child_process'
import { dirname, join } from 'path'
import { promises as fsp } from 'fs'
import { get as httpsGet } from 'https'
import sudo from 'sudo-prompt'

import { fileExists } from './util'

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

export const getEnvPathChromePath = async () => {
  const chromePath = (await which('chrome'))?.trim()
  if (!chromePath) {
    throw new Error('Could not find Google Chrome! Is it installed and on the path?')
  }
  return chromePath
}

export const getChromeVersion = async (chromePath: string) => {
  if (isWin) {
    const { stdout } = await promisify(exec)(
      `wmic datafile where name=${JSON.stringify(chromePath)} get Version /value`,
    )
    return stdout.trim().replace(/^Version=/, '')
  } else {
    const { stdout } = await promisify(exec)(`'${chromePath}' --version`)
    return stdout.substring(stdout.trim().lastIndexOf(' ') + 1).trim()
  }
}

export const getLatestChromeDriverVersion = async (chromeVersion: string) => {
  // See https://stackoverflow.com/a/55266105/1980909

  const url =
    'https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_' +
    chromeVersion.replace(/\.\d+$/, '')

  return await fetch(url)
    .then((r) => r.text())
    .then((t) => t.trim())
}

export const installChromeDriver = async (
  chromeDriverVersion: string,
  targetDir?: string,
  adminPrompt = true,
) => {
  if (!targetDir) targetDir = dirname(await getEnvPathChromePath())
  let folder
  let zipname
  if (isWin) {
    folder = 'win64'
    zipname = 'chromedriver-win64'
  } else if (isMac) {
    folder = 'mac-x64'
    zipname = 'chromedriver-mac-x64'
  } else {
    folder = 'linux64'
    zipname = 'chromedriver-linux64'
  }

  const url = `https://storage.googleapis.com/chrome-for-testing-public/${chromeDriverVersion}/${folder}/${zipname}.zip`

  await withTmpDir(
    async (unzipDir) => {
      console.log(`Unzipping ${url} to ${unzipDir.path}`)
      await new Promise((resolve, reject) => {
        const extract = Extract({ path: unzipDir.path })
        extract.on('close', resolve)
        extract.on('error', reject)
        httpsGet(url, (res) => {
          console.log(res)
          res.pipe(extract)
        })
      })

      let chromedriver = 'chromedriver'
      if (isWin) {
        chromedriver += '.exe'
      }
      console.log(`Copying ${chromedriver} to ${targetDir}`)
      const sourcePath = join(unzipDir.path, zipname, chromedriver)
      const targetPath = join(targetDir!, chromedriver)
      fsp.chmod(sourcePath, 0o755)

      if (adminPrompt) {
        await promisify<string, { name: string }, Buffer>(sudo.exec)(
          `move /Y ${JSON.stringify(sourcePath)} ${JSON.stringify(targetPath)}`,
          { name: 'Copy Chromedriver' },
        )
      } else {
        await fsp.copyFile(sourcePath, targetPath)
      }
    },
    { prefix: 'chromedriver', unsafeCleanup: true },
  )
}
export const getChromeDriverVersion = async (chromeDriverPath = 'chromedriver') => {
  let chromedriverVersionCommand
  if (isWin) {
    chromedriverVersionCommand = `${chromeDriverPath} --version`
  } else {
    chromedriverVersionCommand = `'${chromeDriverPath}' --version`
  }
  const { stdout } = await promisify(exec)(chromedriverVersionCommand)
  return stdout
    .trim()
    .replace(/^ChromeDriver\s*/, '')
    .replace(/\s.*/, '')
}

export const getNonEnvPathChromePath = async () => {
  for (const path of [
    'C:\\Program Files (x86)\\Google\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\UserName\\AppDataLocal\\Google\\Chrome\\chrome.exe',
    'C:\\Documents and Settings\\UserName\\Local Settings\\Application Data\\Google\\Chrome\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]) {
    if (await fileExists(path)) {
      return path
    }
  }
  return undefined
}
