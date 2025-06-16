import {PlatformIntegration} from "../src/platform-integration";
import {OTTIntegration} from "../src";

const platformIntegration: PlatformIntegration = await OTTIntegration.create('', {headless: false, executablePath: '' })

