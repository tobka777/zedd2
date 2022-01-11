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

export const getEnvPathChromePath = async () => {
  const chromePath = (await which('chrome'))?.trim()
  if (!chromePath) {
    throw new Error('Could not find Google Chrome! Is it installed and on the path?')
  }
  return chromePath
}

export const getChromeVersion = async (chromePath: string) => {
  const { stdout } = await promisify(exec)(
    `wmic datafile where name=${JSON.stringify(chromePath)} get Version /value`,
  )
  return stdout.trim().replace(/^Version=/, '');
}

export const getLatestChromeDriverVersion = async (chromeVersion: string) => {
  // See https://stackoverflow.com/a/55266105/1980909

  const url =
    'https://chromedriver.storage.googleapis.com/LATEST_RELEASE_' +
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
  const url = `https://chromedriver.storage.googleapis.com/${chromeDriverVersion}/chromedriver_win32.zip`

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

      console.log(`Copying chromedriver.exe to ${targetDir}`)
      const sourcePath = join(unzipDir.path, 'chromedriver.exe')
      const targetPath = join(targetDir!, 'chromedriver.exe')
      if (adminPrompt) {
        await promisify(sudo.exec)(
          `move /Y ${JSON.stringify(sourcePath)} ${JSON.stringify(targetPath)}`,
          { name: 'Copy Chromedriver' },
        )
      } else {
        await fsp.copyFile(sourcePath, targetPath)
      }
    },
    { prefix: 'chromedriver' },
  )
}
export const getChromeDriverVersion = async (chromeDriverPath = 'chromedriver') => {
  const { stdout } = await promisify(exec)(`${chromeDriverPath} --version`)
  return stdout
    .trim()
    .replace(/^ChromeDriver\s*/, '')
    .replace(/\s.*/, '');
}

export const getNonEnvPathChromePath = async () => {
  for (const path of [
    'C:\\Program Files (x86)\\Google\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\UserName\\AppDataLocal\\Google\\Chrome\\chrome.exe',
    'C:\\Documents and Settings\\UserName\\Local Settings\\Application Data\\Google\\Chrome\\chrome.exe',
  ]) {
    if (await fileExists(path)) {
      return path
    }
  }
  return undefined
}
