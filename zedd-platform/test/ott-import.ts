import { PlatformIntegration } from '../src/platform-integration'
import { OTTIntegration } from '../src/ott/ott-integration'

const platformIntegration: PlatformIntegration = new OTTIntegration('', {
  headless: false,
})
