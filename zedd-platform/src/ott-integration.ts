import puppeteer from 'puppeteer'

export async function importOTTTasks(nikuLink: string) {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    await page.goto(nikuLink);

    await page.waitForSelector('[role="table"]');

    await page.setRequestInterception(true);

    const dropdown = await page.waitForSelector('.MuiBox-root.jss137.jss124 > .MuiInputBase-root.MuiOutlinedInput-root.jss125');

    await dropdown!.click();

    const dropdownOptions = await page.waitForSelector('.MuiPaper-root.MuiMenu-paper.MuiPopover-paper.MuiPaper-elevation8.MuiPaper-rounded > .MuiList-root.MuiMenu-list.MuiList-padding');

    console.log('TU JESTEM1')
    const allAssigned = await dropdownOptions?.waitForSelector('li[data-value="All"]')
    console.log('TU JESTEM2')
    await allAssigned!.click();
    console.log('TU JESTEM3')

    page.on('request', req => {
        req.continue();
    });
    page.on('response', async res => {
        try {
            const jsonResponse = await res.json();
            if (jsonResponse && Array.isArray(jsonResponse.data)) {
                // const mappedData = jsonResponse.data.map(item => ({
                //
                // }));
                //console.log('Mapped Data:', mappedData);
            }
        } catch (error) {
            console.error('Error parsing JSON:', error);
        }

    });
    // sleep(50000)
    // await browser.close();

    return "HALLOS wie gehts";

}