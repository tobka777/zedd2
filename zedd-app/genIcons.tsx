import { promises as fsp } from 'fs'
import * as React from 'react'
import * as ReactDOMServer from 'react-dom/server'
// import icongen = require('icon-gen')
const { convertFile } = require('convert-svg-to-png')
import { convert as icoConvert } from '@fiahfy/ico-convert'
import { convert as icnsConvert } from '@fiahfy/icns-convert'

import { ZeddSvgIcon } from './src/components/ZeddSvgIcon'

async function genIcon(name: string, svg: (res: number) => React.ReactElement) {
  const ress = [16, 24, 128]
  for (const res of ress) {
    const svgString = ReactDOMServer.renderToStaticMarkup(svg(res))
    const svgFile = `./icons/${name}_${res}.svg`
    await fsp.writeFile(svgFile, svgString, 'utf8')
    // await icongen(svgFile, './icons', {
    //   report: true,
    //   ico: {
    //     name,
    //     // sizes: [16, 24, 32, 48, 64, 128, 256],
    //     sizes: [24],
    //   },
    // })
    await convertFile(svgFile, {
      outputFilePath: `./icons/${name}_${res}.png`,
    })
  }
  const icoData = await icoConvert(
    await Promise.all(ress.map((res) => fsp.readFile(`./icons/${name}_${res}.png`))),
  )
  await fsp.writeFile(`./icons/${name}.ico`, icoData)

  if (name == 'app') {
    const icnsData = await icnsConvert(
      await Promise.all(ress.map((res) => fsp.readFile(`./icons/${name}_${res}.png`))),
    )
    await fsp.writeFile(`./icons/${name}.icns`, icnsData)
  }
}

;(async () => {
  await fsp.mkdir('icons')

  const NUMBER_OF_SAMPLES = 13
  await genIcon('paused', (res) => (
    <ZeddSvgIcon stroke='white' res={res} stopped={true} progress={0} />
  ))
  for (let i = 0; i < NUMBER_OF_SAMPLES; i++) {
    const progress = i / (NUMBER_OF_SAMPLES - 1)
    await genIcon('progress' + i, (res) => (
      <ZeddSvgIcon stroke='white' res={res} stopped={false} progress={progress} />
    ))
  }
  await genIcon('app', (res) => (
    <ZeddSvgIcon stroke='white' res={res} stopped={false} progress={1 / 4} background='#326da8' />
  ))
})()
