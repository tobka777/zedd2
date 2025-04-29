import {parseISO} from "date-fns";
import {PlatformExportFormat} from "./model/platform-export-format.model";
import puppeteer, {Browser} from "puppeteer";

let browser: Browser;

export async function fillOTT(
    nikuLink: string,
    data: PlatformExportFormat,
    submitTimesheets: boolean,
    resourceName: string | undefined
): Promise<void> {
    return exportToOTT(data, submitTimesheets, resourceName, nikuLink)
}

export async function exportToOTT(whatt: PlatformExportFormat,
                                  submitTimesheets: boolean,
                                  resourceName: string | undefined,
                                  nikuLink: string) {

    let what = Object.keys(whatt).map((dateString: string) => ({
        day: parseISO(dateString),
        work: whatt[dateString],
    }))

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

}
export async function closeBrowser() {
    if (browser) {
        await browser.close()
    }
}