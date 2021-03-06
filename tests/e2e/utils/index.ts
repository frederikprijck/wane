import { compile, WaneCompilerOptions } from '../../../src/compiler/compile'
import { expectDomStructure, h } from './vdom'
import * as puppeteer from 'puppeteer'
import { spawn } from 'child_process'
import * as path from 'path'
import * as isTravis from 'is-travis'
import chalk from "chalk";

export async function compileTestApp (opts: Partial<WaneCompilerOptions>) {
  await compile({ pretty: true, ...opts })
}

export async function runTest (__dirname: string, test: (page: puppeteer.Page) => Promise<void>): boolean {

  const testName = path.basename(__dirname)

  let browser: puppeteer.Browser | undefined
  let page: puppeteer.Page | undefined

  try {

    if (isTravis) {
      browser = await puppeteer.launch({ args: ['--no-sandbox'] })
    } else {
      browser = await puppeteer.launch()
    }

    try {
      await compileTestApp({ dir: __dirname })
      page = await browser.newPage()
      await page.goto(`file:///${__dirname}/dist/index.html`)
      await test(page)
      return true
    } catch (e) {
      console.error(chalk.red(`Expected app ${chalk.bold(testName)} to compile successfully.`))
      console.error(e)
      return false
    }

  } catch (error) {

    console.error(chalk.bgRedBright.whiteBright(`The test for ${chalk.bold(testName)} has failed!`))
    try {
      await page!.screenshot({ path: 'screenshot.png' })
      const eog = spawn('eog', ['screenshot.png'])
      if (eog.stderr) {
        console.error(`Could not open the image automatically. Check "${path.join(__dirname, 'screenshot.png')}".`)
      }
    } catch (innerError) {
      console.error(`Could not take a screenshot or open it. See the trace below.`)
      console.error(innerError)
    }
    throw error

  } finally {

    try {
      await browser!.close()
    } catch (error) {
      console.error(`Could not close browser. See trace below.`)
      console.error(error)
    }

  }
}


export { expectDomStructure, h }
