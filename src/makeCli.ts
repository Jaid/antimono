import {Clerc, friendlyErrorPlugin, helpPlugin, strictFlagsPlugin, versionPlugin} from 'clerc'

import packageMetadata from '../package.json'
import mainCommand from './command/mainCommand.ts'

export default (args?: Array<string>) => {
  const cli = Clerc.create({
    scriptName: Bun.env.npm_package_name ?? 'antimono',
    description: Bun.env.npm_package_description ?? 'Build the Antimono font from Iosevka',
    version: packageMetadata.version,
    name: Bun.env.npm_package_name ?? 'antimono',
  })
    .use(helpPlugin())
    .use(versionPlugin())
    .use(strictFlagsPlugin())
    .use(friendlyErrorPlugin())
    .command(mainCommand)
  return async () => {
    await cli.parse(args)
  }
}
