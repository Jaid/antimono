import type mainCommand from './mainCommand.ts'
import type {CommandHandler} from 'clerc'

import antimono from '../antimono.ts'

// eslint-disable-next-line typescript/no-misused-promises
export const run: CommandHandler<typeof mainCommand> = async context => {
  const {flags} = context
  await antimono({
    clean: flags.clean,
    dockerHost: flags.dockerHost,
    fontsFolder: flags.fonts,
    iosevkaBuilderImage: flags.iosevkaBuilderImage,
    nerdFontCategories: flags.nerdFont,
    nerdFontsPatcherImage: flags.nerdFontsPatcherImage,
    output: flags.output,
    rootFolder: flags.root,
    temp: flags.temp,
  })
}
