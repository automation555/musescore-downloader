/* eslint-disable no-extend-native */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { hookNative } from './anti-detection'
import { console, useTimeout } from './utils'

type FileType = 'img' | 'mp3' | 'midi'

const TYPE_REG = /type=(img|mp3|midi)/

/**
 * I know this is super hacky.
 */
const magicHookConstr = (() => {
  const l = {}

  try {
    const p = Object.getPrototypeOf(document.body)
    Object.setPrototypeOf(document.body, null)

    hookNative(document.body, 'append', () => {
      return function (...nodes: Node[]) {
        p.append.call(this, ...nodes)

        if (nodes[0].nodeName === 'IFRAME') {
          const iframe = nodes[0] as HTMLIFrameElement
          const w = iframe.contentWindow as Window

          hookNative(w, 'fetch', () => {
            return function (url, init) {
              const token = init?.headers?.Authorization
              if (typeof url === 'string' && token) {
                const m = url.match(TYPE_REG)
                console.debug(url, token, m)
                if (m) {
                  const type = m[1]
                  // eslint-disable-next-line no-unused-expressions
                  l[type]?.(token)
                }
              }
              return fetch(url, init)
            }
          })
        }
      }
    })

    Object.setPrototypeOf(document.body, p)
  } catch (err) {
    console.error(err)
  }

  return async (type: FileType) => {
    return new Promise<string>((resolve) => {
      l[type] = (token) => {
        resolve(token)
        magics[type] = token
      }
    })
  }
})()

const magics: Record<FileType, Promise<string>> = {
  img: magicHookConstr('img'),
  midi: magicHookConstr('midi'),
  mp3: magicHookConstr('mp3'),
}

const getApiUrl = (id: number, type: FileType, index: number): string => {
  return `/api/jmuse?id=${id}&type=${type}&index=${index}&v2=1`
}

const getApiAuth = async (type: FileType, index: number): Promise<string> => {
  // eslint-disable-next-line no-void
  void index

  const magic = magics[type]
  if (magic instanceof Promise) {
    // force to retrieve the MAGIC
    switch (type) {
      case 'midi': {
        const el = document.querySelector('button[hasaccess]') as HTMLButtonElement
        el.click()
        break
      }
      case 'mp3': {
        const el = document.querySelector('button[title="Toggle Play"]') as HTMLButtonElement
        el.click()
        break
      }
      case 'img': {
        const imgE = document.querySelector('img[src*=score_]')
        const nextE = imgE?.parentElement?.nextElementSibling
        if (nextE) nextE.scrollIntoView()
        break
      }
    }
  }

  try {
    return await useTimeout(magic, 5 * 1000 /* 5s */)
  } catch {
    console.error(type, 'token timeout')
    switch (type) {
      // try hard-coded tokens
      case 'img': return '8c022bdef45341074ce876ae57a48f64b86cdcf5'
      case 'midi': return '38fb9efaae51b0c83b5bb5791a698b48292129e7'
      case 'mp3': return '63794e5461e4cfa046edfbdddfccc1ac16daffd2'
    }
  }
}

export const getFileUrl = async (id: number, type: FileType, index = 0): Promise<string> => {
  const url = getApiUrl(id, type, index)
  const auth = await getApiAuth(type, index)

  const r = await fetch(url, {
    headers: {
      Authorization: auth,
    },
  })

  const { info } = await r.json()
  return info.url as string
}
