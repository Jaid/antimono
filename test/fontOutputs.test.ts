/* eslint-disable no-restricted-imports -- Isolated temporary fixtures use the native filesystem API. */
import {expect, test} from 'bun:test'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import * as path from 'node:path'

import loadIcons from '#src/icons/loadIcons.ts'

const root = path.join(import.meta.dir, '..')
const pythonExecutable = Bun.env.ANTIMONO_TEST_PYTHON ?? path.join(root, 'temp', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const hasPythonEnvironment = await Bun.file(pythonExecutable).exists()
test.skipIf(!hasPythonEnvironment)('generates and validates all font variants with FontTools', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'antimono-icons-test-'))
  try {
    const iconsFile = path.join(folder, 'icons.json')
    await Bun.write(iconsFile, JSON.stringify(await loadIcons()))
    const result = Bun.spawnSync([pythonExecutable, path.join(import.meta.dir, 'font_processor_test.py'), '-v'], {
      cwd: root,
      env: {
        ...process.env,
        ANTIMONO_TEST_ICONS: iconsFile,
        PYTHONDONTWRITEBYTECODE: '1',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const details = result.stdout.toString() + result.stderr.toString()
    expect(result.exitCode, details).toBe(0)
    expect(details).toContain('OK')
  } finally {
    await rm(folder, {
      force: true,
      recursive: true,
    })
  }
}, 60_000)
