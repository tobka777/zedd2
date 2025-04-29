import puppeteer from 'puppeteer'
import {parseISO} from "date-fns";
import {ClarityExportFormat} from "./clarity-integration";

export async function exportToOTT(whatt: ClarityExportFormat) {

    let what = Object.keys(whatt).map((dateString: string) => ({
        day: parseISO(dateString),
        work: whatt[dateString],
    }))

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();


    return "HALLOS wie gehts";
}