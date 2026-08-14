/**
 * Rasterize the DeepSeek Harness logo mark (website/public/favicon.svg) into
 * a 512x512 transparent PNG for electron-builder. Run under Electron so the
 * Chromium SVG renderer matches the shipped app.
 *
 * Usage: electron scripts/render-icon.mjs <svg> <png>
 */

import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'

const [svgPath, pngPath] = process.argv.slice(2)
if (svgPath === undefined || pngPath === undefined) {
  console.error('usage: electron render-icon.mjs <svg> <png>')
  process.exit(2)
}

app.whenReady().then(async () => {
  const svg = readFileSync(svgPath, 'utf8')
  const page = [
    '<!doctype html><html><head><meta charset="utf-8"></head>',
    '<body style="margin:0;width:512px;height:512px;display:flex;align-items:center;justify-content:center;background:transparent">',
    `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="432" height="432">`,
    '</body></html>',
  ].join('')
  const window = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  })
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`)
    await new Promise(resolve => setTimeout(resolve, 400))
    const image = await window.webContents.capturePage()
    writeFileSync(pngPath, image.toPNG())
    console.log(pngPath)
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
