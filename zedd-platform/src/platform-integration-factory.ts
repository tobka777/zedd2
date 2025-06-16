import { PlatformType } from './model'
import { PlatformIntegration } from './platform-integration'
import { OTTIntegration } from './ott-integration'
import { PlatformOptions } from './model/platform.options.model'
import { RepliconIntegration } from './replicon-integration'
import { AllIntegration } from './all-integration'

export class PlatformIntegrationFactory {
  async create(
    type: 'ALL' | PlatformType,
    ottLink: string,
    repliconLink: string,
    options: PlatformOptions,
  ): Promise<PlatformIntegration> {
    switch (type) {
      case 'ALL':
        return await AllIntegration.create(ottLink, repliconLink, options)
      case 'OTT':
        return await OTTIntegration.create(ottLink, options)
      case 'REPLICON':
        return await RepliconIntegration.create(repliconLink, options)
      default:
        throw new Error(`Unknown platform type ${type}`)
    }
  }
}
