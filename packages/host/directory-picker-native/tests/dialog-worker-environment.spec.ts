import { describe, expect, it } from 'vitest'
import { dialogWorkerEnvironment } from '../src/win32-dialog-host.ts'

describe('dialog worker environment', () => {
  it('opts the child into Node mode under an Electron host', () => {
    expect(dialogWorkerEnvironment({ DSH_DIALOG_TITLE: 'pick', KEEP: '1' }, true))
      .toEqual({ DSH_DIALOG_TITLE: 'pick', KEEP: '1', ELECTRON_RUN_AS_NODE: '1' })
  })

  it('leaves the inherited environment untouched under plain Node', () => {
    expect(dialogWorkerEnvironment({ DSH_DIALOG_TITLE: 'pick' }, false))
      .toEqual({ DSH_DIALOG_TITLE: 'pick' })
  })
})
