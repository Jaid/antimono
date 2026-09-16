import {defineCommand, Types} from 'clerc'

import {defaultOptions, nerdFontCategories} from '../antimono.ts'

const makeEnum = Types.Enum
const mainCommand = defineCommand({
  name: '',
  description: 'Build the Antimono font from Iosevka',
  flags: {
    dockerHost: {
      type: String,
      default: Bun.env.DOCKER_HOST,
      description: 'Docker daemon host, for example ssh://nas',
    },
    output: {
      type: String,
      short: 'o',
      default: defaultOptions.output,
      description: 'Output folder relative to the project root',
    },
    temp: {
      type: String,
      default: defaultOptions.temp,
      description: 'Temporary workspace folder relative to the project root',
    },
    fonts: {
      type: String,
      description: 'Font preset folder relative to the project root',
    },
    root: {
      type: String,
      description: 'Project root',
    },
    iosevkaBuilderImage: {
      type: String,
      default: defaultOptions.iosevkaBuilderImage,
      description: 'Docker image used to build Iosevka',
    },
    nerdFontsPatcherImage: {
      type: String,
      default: defaultOptions.nerdFontsPatcherImage,
      description: 'Docker image used to patch Nerd Fonts glyphs',
    },
    nerdFont: {
      type: [makeEnum(...nerdFontCategories)] as const,
      description: `Nerd Fonts category to bake in; repeat for multiple categories: ${nerdFontCategories.join(', ')}`,
    },
    clean: {
      type: Boolean,
      default: defaultOptions.clean,
      description: 'Clean the output folder before building',
    },
  },
// eslint-disable-next-line typescript/no-misused-promises
}, async context => {
  const {run} = await import('./main.ts')
  await Promise.resolve(run(context))
})

export default mainCommand
