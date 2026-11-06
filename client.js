window.__ModuleLoader__.load({
  id: '@local/window-chat',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const LS_KEY = 'dsh.window-chat.v3'
    const POLL_MS = 1500
    const bridge = { ctx: null }

    /** Every user-visible string, resolved from the active Client locale. */
    const STR = {
      en: {
        title: 'Cross-window chat',
        launcher: 'Cross-window chat',
        current: 'This window',
        peer: 'Other window',
        choose: 'Choose a conversation',
        search: 'Search sessions…',
        noMatch: 'No matching session',
        noSessions: 'No other conversations',
        loading: 'Loading…',
        refresh: 'Refresh list',
        clear: 'Clear transcript',
        placeholder: 'Write to the other window…',
        placeholderNoTarget: 'Pick the other window first',
        send: 'Send',
        sending: 'Sending…',
        autoStart: 'Auto chat',
        autoStop: 'Stop',
        maxRounds: 'Rounds',
        autoStarted: 'Automatic exchange started.',
        autoStopped: 'Reached the round limit; automatic exchange stopped.',
        autoPaused: 'Automatic exchange stopped.',
        emptyTitle: 'Pick another conversation window',
        emptyBody: 'Then send it a message. Replies appear here as they arrive.',
        minimize: 'Collapse',
        expand: 'Expand',
        close: 'Close',
        errNoChannel: 'This page has no session channel available.',
        errSend: 'The message could not be delivered.',
        errSame: 'This is the same window; pick a different conversation.',
        errNoTarget: 'Pick the other window first.',
        errRetain: 'Could not open that conversation.',
        peerBusy: 'The other window is replying…',
        fromPeerPrefix: 'Message from the other chat window (${PEER}):',
        dirToPeer: 'me → other',
        dirFromPeer: 'other → me',
        dirAutoToHere: 'relayed into this window',
        dirAutoToPeer: 'relayed to the other window',
        dirNote: 'note',
        connected: 'Connected to',
        now: 'just now',
        min: 'min ago',
        hour: 'h ago',
        day: 'd ago',
        statusIdle: 'Ready',
        statusBusy: 'Peer replying',
        statusConnected: 'Connected',
      },
      zh: {
        title: '窗口间对话',
        launcher: '窗口间对话',
        current: '本窗口',
        peer: '对方窗口',
        choose: '选择一个会话',
        search: '搜索会话…',
        noMatch: '没有匹配的会话',
        noSessions: '没有其它会话',
        loading: '加载中…',
        refresh: '刷新列表',
        clear: '清空记录',
        placeholder: '发给对方窗口…',
        placeholderNoTarget: '请先选择对方窗口',
        send: '发送',
        sending: '发送中…',
        autoStart: '自动对话',
        autoStop: '停止',
        maxRounds: '轮数',
        autoStarted: '已开始自动对话。',
        autoStopped: '达到轮数上限，自动对话已停止。',
        autoPaused: '自动对话已停止。',
        emptyTitle: '先选一个“另一个窗口”',
        emptyBody: '然后给它发一条消息，对方的回复会实时出现在这里。',
        minimize: '收起',
        expand: '展开',
        close: '关闭',
        errNoChannel: '当前页面没有可用的会话通道。',
        errSend: '消息没有送达。',
        errSame: '这就是当前窗口，请换一个会话。',
        errNoTarget: '请先选择对方窗口。',
        errRetain: '打不开这个会话。',
        peerBusy: '对方正在回复…',
        fromPeerPrefix: '来自另一个聊天窗口（${PEER}）的消息：',
        dirToPeer: '我 → 对方',
        dirFromPeer: '对方 → 我',
        dirAutoToHere: '自动转入本窗口',
        dirAutoToPeer: '自动转给对方',
        dirNote: '提示',
        connected: '已连接到',
        now: '刚刚',
        min: '分钟前',
        hour: '小时前',
        day: '天前',
        statusIdle: '就绪',
        statusBusy: '对方回复中',
        statusConnected: '已连接',
      },
    }

    let saved = {}
    try {
      saved = JSON.parse(window.localStorage.getItem(LS_KEY) || '{}') || {}
    } catch (_) {
      saved = {}
    }

    const store = {
      open: saved.seeded === true ? saved.open === true : true,
      targetId: typeof saved.targetId === 'string' && saved.targetId ? saved.targetId : null,
      auto: false,
      maxHops: typeof saved.maxHops === 'number' && saved.maxHops >= 1 ? Math.min(20, Math.floor(saved.maxHops)) : 3,
      hops: 0,
      log: [],
      sessions: [],
      currentA: null,
      currentATitle: '',
      loadingSessions: false,
      busy: false,
      error: null,
      locale: 'zh',
      cursor: { a: null, b: null },
      peerRunning: false,
    }

    let version = 0
    const listeners = new Set()
    function emit() {
      version += 1
      for (const fn of Array.from(listeners)) {
        try {
          fn()
        } catch (_) {
          /* a broken subscriber must not break the store */
        }
      }
    }
    function subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    }
    function getVersion() {
      return version
    }
    function useStore() {
      return React.useSyncExternalStore(subscribe, getVersion, getVersion)
    }

    function persist() {
      try {
        window.localStorage.setItem(
          LS_KEY,
          JSON.stringify({
            seeded: true,
            open: store.open,
            targetId: store.targetId,
            maxHops: store.maxHops,
            pos: store.pos || null,
            size: store.size || null,
          }),
        )
      } catch (_) {
        /* private mode */
      }
    }

    function t(key) {
      const table = STR[store.locale === 'zh' ? 'zh' : 'en']
      return table[key] || STR.zh[key] || key
    }

    function shortId(id) {
      return String(id || '').replace(/^session-/, '').slice(0, 8)
    }

    function service(name) {
      try {
        return bridge.ctx ? bridge.ctx.get(name) : undefined
      } catch (_) {
        return undefined
      }
    }

    function addLog(dir, text) {
      const clean = String(text || '').trim()
      if (!clean) return
      store.log.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        dir,
        text: clean,
        time: Date.now(),
      })
      if (store.log.length > 200) store.log.splice(0, store.log.length - 200)
    }

    function note(text) {
      addLog('note', text)
    }

    function ago(timestamp) {
      if (!timestamp) return ''
      const diff = Date.now() - timestamp
      if (!isFinite(diff) || diff < 60000) return t('now')
      if (diff < 3600000) return Math.floor(diff / 60000) + ' ' + t('min')
      if (diff < 86400000) return Math.floor(diff / 3600000) + ' ' + t('hour')
      return Math.floor(diff / 86400000) + ' ' + t('day')
    }

    function clock(timestamp) {
      try {
        return new Date(timestamp).toLocaleTimeString(store.locale === 'zh' ? 'zh-CN' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        })
      } catch (_) {
        return ''
      }
    }

    function withTimeout(promise, ms, fallback) {
      return new Promise((resolve) => {
        let settled = false
        const timer = window.setTimeout(() => {
          if (settled) return
          settled = true
          resolve(fallback)
        }, ms)
        Promise.resolve(promise).then(
          (value) => {
            if (settled) return
            settled = true
            window.clearTimeout(timer)
            resolve(value)
          },
          () => {
            if (settled) return
            settled = true
            window.clearTimeout(timer)
            resolve(fallback)
          },
        )
      })
    }

    const TIMEOUT = { __wcTimeout: true }

    /**
     * Text blocks only. `reasoning` (thinking) and tool blocks are never shown
     * or relayed, so a turn's private draft cannot leak into the other window.
     */
    function extractText(data) {
      if (!data || typeof data !== 'object') return ''
      const message = data.message && typeof data.message === 'object' ? data.message : data
      let blocks = Array.isArray(message.content) ? message.content : null
      if (!blocks && Array.isArray(data.content)) blocks = data.content
      if (!blocks) return ''
      const parts = []
      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue
        if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
      }
      return parts.join('\n\n').trim()
    }

    function titleOf(row) {
      if (!row) return ''
      const values = (row.projectionValues || (row.projections && row.projections.values)) || null
      const candidates = [row.displayTitle, row.title, values && values.sessionTitle, values && values.title]
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
        if (candidate && typeof candidate === 'object' && typeof candidate.title === 'string' && candidate.title.trim()) {
          return candidate.title.trim()
        }
      }
      return ''
    }

    // ---------------------------------------------------------------- links
    // One retained Client reference per Session id: prompt(), the live event
    // window and running state all come from that reference.
    const links = new Map()

    function linkFor(sessionId) {
      if (!sessionId) return null
      const existing = links.get(sessionId)
      if (existing) return existing.pending
      const link = { id: sessionId, ref: null, binding: null, error: null, pending: null }
      links.set(sessionId, link)
      link.pending = (async () => {
        const sessions = service('sessions')
        if (!sessions || typeof sessions.retain !== 'function') {
          link.error = t('errNoChannel')
          return link
        }
        try {
          try {
            link.ref = sessions.retain(sessionId, { source: 'windowChat' })
          } catch (_) {
            link.ref = sessions.retain(sessionId, { source: 'controllerOperation' })
          }
          const binding = await withTimeout(link.ref.ready, 5000, null)
          if (binding) {
            link.binding = binding
          } else {
            link.error = t('errRetain')
          }
        } catch (error) {
          link.error = String((error && error.message) || error)
        }
        return link
      })()
      return link.pending
    }

    function dropLink(sessionId) {
      const link = links.get(sessionId)
      if (!link) return
      links.delete(sessionId)
      try {
        if (link.ref && typeof link.ref.release === 'function') link.ref.release()
      } catch (_) {
        /* already released */
      }
    }

    function dropAllLinks() {
      for (const id of Array.from(links.keys())) dropLink(id)
    }

    // ------------------------------------------------------------- sessions
    function localRows() {
      const sessions = service('sessions')
      const source = sessions && sessions.list
      let snapshot = null
      try {
        snapshot = source && typeof source.getSnapshot === 'function' ? source.getSnapshot() : source || null
      } catch (_) {
        snapshot = null
      }
      const rows = []
      const table = snapshot && snapshot.list && typeof snapshot.list === 'object' ? snapshot.list : null
      const effective = table && (Array.isArray(table.ids) || table.byId) ? table : snapshot
      if (effective && Array.isArray(effective.ids)) {
        for (const id of effective.ids) rows.push({ sessionId: id, row: effective.byId ? effective.byId[id] : null })
      } else if (effective && effective.byId && typeof effective.byId === 'object') {
        for (const id of Object.keys(effective.byId)) rows.push({ sessionId: id, row: effective.byId[id] })
      } else if (Array.isArray(effective)) {
        for (const row of effective) if (row && row.sessionId) rows.push({ sessionId: row.sessionId, row })
      }
      return rows
    }

    function publishRows(rows) {
      const current = rows.find((row) => row.sessionId === store.currentA)
      if (current) store.currentATitle = current.title || ''
      const filtered = rows.filter(
        (row) => row && row.sessionId && (!store.currentA || row.sessionId !== store.currentA),
      )
      filtered.sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
      store.sessions = filtered.slice(0, 60)
      store.loadingSessions = false
      emit()
    }

    function refreshSessions() {
      store.loadingSessions = true
      emit()
      const rows = []
      for (const entry of localRows()) {
        const row = entry.row
        rows.push({
          sessionId: entry.sessionId,
          title: titleOf(row),
          updatedAt: row && typeof row.updatedAt === 'number' ? row.updatedAt : undefined,
          running: Boolean(row && row.running),
        })
      }
      publishRows(rows)
    }

    // ---------------------------------------------------------------- traffic
    async function promptSession(sessionId, text) {
      const link = await linkFor(sessionId)
      if (!link || !link.binding || typeof link.binding.session.prompt !== 'function') {
        throw new Error((link && link.error) || t('errNoChannel'))
      }
      const result = await withTimeout(link.binding.session.prompt([{ type: 'text', text }], 'queue'), 15000, TIMEOUT)
      if (result === TIMEOUT) throw new Error(t('errSend'))
      if (result && result.ok === false) {
        throw new Error((result.error && (result.error.message || result.error.code)) || t('errSend'))
      }
      return result
    }

    async function readSession(sessionId) {
      const link = await linkFor(sessionId)
      if (!link || !link.binding) throw new Error((link && link.error) || t('errNoChannel'))
      const binding = link.binding
      const window_ = binding.eventSource && binding.eventSource.getSnapshot ? binding.eventSource.getSnapshot() : null
      const entries = (window_ && window_.entries) || []
      const messages = []
      let maxSeq = -1
      for (const entry of entries) {
        if (!entry || entry.type !== 'event' || !entry.event) continue
        const event = entry.event
        if (typeof event.type !== 'string') continue
        if (typeof event.seq === 'number' && event.seq > maxSeq) maxSeq = event.seq
        if (event.type !== 'assistant/message' && event.type !== 'user/message') continue
        messages.push({ seq: event.seq, type: event.type, text: extractText(event.data) })
      }
      let running = false
      try {
        running = Boolean(binding.session && binding.session.getSnapshot && binding.session.getSnapshot().running)
      } catch (_) {
        running = false
      }
      return { messages, cursor: maxSeq, running }
    }

    let ticking = false
    async function tick() {
      if (ticking) return
      ticking = true
      try {
        const a = store.currentA
        const b = store.targetId
        if (!b || b === a) return
        const peer = await readSession(b)
        if (store.cursor.b === null) {
          store.cursor.b = peer.cursor
        } else if (peer.cursor > store.cursor.b) {
          const fresh = peer.messages.filter((message) => message.seq > store.cursor.b && message.text)
          store.cursor.b = peer.cursor
          const replies = []
          for (const message of fresh) {
            if (message.type !== 'assistant/message') continue
            replies.push(message.text)
            addLog('fromB', message.text)
          }
          if (store.auto && store.hops < store.maxHops && a && replies.length) {
            const text = replies.join('\n\n')
            await promptSession(a, t('fromPeerPrefix').replace('${PEER}', shortId(b)) + '\n' + text)
            store.hops += 1
            addLog('autoToA', text)
          }
        }
        store.peerRunning = peer.running

        if (store.auto && a && store.hops < store.maxHops) {
          const mine = await readSession(a)
          if (store.cursor.a === null) {
            store.cursor.a = mine.cursor
          } else if (mine.cursor > store.cursor.a) {
            const fresh = mine.messages.filter(
              (message) => message.type === 'assistant/message' && message.seq > store.cursor.a && message.text,
            )
            store.cursor.a = mine.cursor
            if (fresh.length) {
              const text = fresh.map((message) => message.text).join('\n\n')
              await promptSession(b, t('fromPeerPrefix').replace('${PEER}', t('current')) + '\n' + text)
              store.hops += 1
              addLog('autoToB', text)
            }
          }
        }

        if (store.auto && store.hops >= store.maxHops) {
          store.auto = false
          note(t('autoStopped'))
        }
      } catch (error) {
        store.error = String((error && error.message) || error)
      } finally {
        ticking = false
        emit()
      }
    }

    function toggleOpen() {
      store.open = !store.open
      store.error = null
      persist()
      emit()
      if (store.open) {
        refreshSessions()
        tick()
      } else {
        dropAllLinks()
      }
    }

    function pickTarget(id) {
      const previous = store.targetId
      if (previous && previous !== id) dropLink(previous)
      store.targetId = id || null
      store.cursor = { a: null, b: null }
      store.peerRunning = false
      store.error = null
      store.log = []
      persist()
      emit()
      if (store.targetId) {
        const row = store.sessions.find((item) => item.sessionId === store.targetId)
        note(t('connected') + ' ' + (row && row.title ? row.title : shortId(store.targetId)))
      }
    }

    // ------------------------------------------------------------- launcher
    function Launcher(props) {
      useStore()
      const sessionId = props && props.sessionId
      React.useEffect(() => {
        if (!sessionId || store.currentA === sessionId) return
        store.currentA = sessionId
        store.cursor.a = null
        if (store.open) refreshSessions()
        emit()
      }, [sessionId])
      const status = store.targetId
        ? store.peerRunning
          ? t('statusBusy')
          : t('statusConnected')
        : t('statusIdle')
      return h(
        'div',
        { className: 'wc-launcher-row' },
        h(
          'button',
          {
            type: 'button',
            className: 'wc-launcher' + (store.open ? ' wc-launcher-active' : ''),
            title: t('launcher') + ' · ' + status,
            'aria-expanded': store.open ? 'true' : 'false',
            onClick: toggleOpen,
          },
          h('span', { className: 'wc-launcher-icon', 'aria-hidden': 'true' }, '⇄'),
          h('span', null, t('launcher')),
          h('span', {
            className:
              'wc-dot ' + (store.peerRunning ? 'wc-dot-busy' : store.targetId ? 'wc-dot-on' : 'wc-dot-idle'),
            'aria-hidden': 'true',
          }),
        ),
      )
    }

    function metaOf(entry) {
      switch (entry.dir) {
        case 'toB':
          return t('dirToPeer')
        case 'fromB':
          return t('dirFromPeer')
        case 'autoToA':
          return t('dirAutoToHere')
        case 'autoToB':
          return t('dirAutoToPeer')
        default:
          return t('dirNote')
      }
    }

    // ------------------------------------------------------------- window UI
    function FloatingWindow() {
      useStore()
      const [draft, setDraft] = React.useState('')
      const [pos, setPos] = React.useState(store.pos)
      const [size, setSize] = React.useState(store.size)
      const [collapsed, setCollapsed] = React.useState(false)
      const [pickerOpen, setPickerOpen] = React.useState(false)
      const [query, setQuery] = React.useState('')
      const logRef = React.useRef(null)

      React.useEffect(() => {
        if (!store.open) return undefined
        refreshSessions()
        const timer = window.setInterval(() => {
          tick()
        }, POLL_MS)
        tick()
        return () => {
          window.clearInterval(timer)
        }
      }, [store.open, store.targetId])

      React.useEffect(() => {
        const element = logRef.current
        if (element) element.scrollTop = element.scrollHeight
      }, [store.log.length, store.open, collapsed])

      React.useEffect(() => {
        store.pos = pos
        store.size = size
        if (store.open) persist()
      }, [pos, size])

      React.useEffect(() => {
        if (!pickerOpen) return undefined
        function onDocDown(event) {
          const target = event.target
          if (target && target.closest && target.closest('[data-wc-picker]')) return
          setPickerOpen(false)
        }
        window.addEventListener('mousedown', onDocDown)
        return () => window.removeEventListener('mousedown', onDocDown)
      }, [pickerOpen])

      React.useEffect(() => {
        if (!store.open) return undefined
        function onKey(event) {
          if (event.key !== 'Escape') return
          if (pickerOpen) {
            setPickerOpen(false)
            return
          }
          store.open = false
          persist()
          dropAllLinks()
          emit()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [store.open, pickerOpen])

      function startDrag(event) {
        if (event.button !== 0) return
        if (event.target && event.target.closest && event.target.closest('button')) return
        const element = event.currentTarget.closest('[data-wc-window]')
        if (!element) return
        const rect = element.getBoundingClientRect()
        const startX = event.clientX
        const startY = event.clientY
        const baseX = rect.left
        const baseY = rect.top
        function move(moveEvent) {
          const width = rect.width
          const height = element.getBoundingClientRect().height
          const maxX = Math.max(8, window.innerWidth - width - 8)
          const maxY = Math.max(8, window.innerHeight - height - 8)
          setPos({
            x: Math.min(Math.max(8, baseX + moveEvent.clientX - startX), maxX),
            y: Math.min(Math.max(8, baseY + moveEvent.clientY - startY), maxY),
          })
        }
        function stop() {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', stop)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', stop)
      }

      function startResize(event) {
        if (event.button !== 0) return
        event.preventDefault()
        const element = event.currentTarget.closest('[data-wc-window]')
        if (!element) return
        const rect = element.getBoundingClientRect()
        const startX = event.clientX
        const startY = event.clientY
        const startW = rect.width
        const startH = rect.height
        function move(moveEvent) {
          const width = Math.min(Math.max(320, startW + (startX - moveEvent.clientX)), window.innerWidth - 24)
          const height = Math.min(Math.max(340, startH + (moveEvent.clientY - startY)), window.innerHeight - 48)
          setSize({ w: width, h: height })
        }
        function stop() {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', stop)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', stop)
      }

      async function send() {
        const text = draft.trim()
        if (!text || !store.targetId || store.busy) return
        if (store.targetId === store.currentA) {
          store.error = t('errSame')
          emit()
          return
        }
        store.busy = true
        store.error = null
        emit()
        try {
          await promptSession(store.targetId, text)
          addLog('toB', text)
          setDraft('')
        } catch (error) {
          store.error = String((error && error.message) || error)
        } finally {
          store.busy = false
          emit()
        }
      }

      function toggleAuto() {
        if (store.auto) {
          store.auto = false
          note(t('autoPaused'))
          emit()
          return
        }
        if (!store.targetId) {
          store.error = t('errNoTarget')
          emit()
          return
        }
        store.auto = true
        store.hops = 0
        store.cursor = { a: null, b: null }
        store.error = null
        note(t('autoStarted'))
        emit()
        tick()
      }

      if (!store.open) return null

      const peer = store.sessions.find((row) => row.sessionId === store.targetId)
      const peerLabel = peer ? peer.title || shortId(peer.sessionId) : store.targetId ? shortId(store.targetId) : t('choose')
      const keyword = query.trim().toLowerCase()
      const filtered = keyword
        ? store.sessions.filter((row) => (row.title || '').toLowerCase().indexOf(keyword) >= 0)
        : store.sessions

      const bubbles = store.log.map((entry) => {
        if (entry.dir === 'note') {
          return h('div', { key: entry.id, className: 'wc-note' }, entry.text)
        }
        return h(
          'div',
          { key: entry.id, className: 'wc-msg wc-' + entry.dir },
          h(
            'div',
            { className: 'wc-meta' },
            h('span', { className: 'wc-dir' }, metaOf(entry)),
            h('span', { className: 'wc-time' }, clock(entry.time)),
          ),
          h('div', { className: 'wc-text' }, entry.text),
        )
      })

      const windowStyle = { width: (size && size.w) || 400, height: collapsed ? undefined : (size && size.h) || 500 }
      if (pos) {
        windowStyle.left = pos.x + 'px'
        windowStyle.top = pos.y + 'px'
      }

      const statusText = store.peerRunning
        ? t('statusBusy')
        : store.targetId
          ? t('statusConnected')
          : t('statusIdle')

      return h(
        React.Fragment,
        null,
        h('style', null, CSS),
        h(
          'div',
          {
            'data-wc-window': '1',
            className: 'wc-window' + (collapsed ? ' wc-collapsed' : ''),
            style: windowStyle,
            role: 'dialog',
            'aria-label': t('title'),
          },
          h(
            'div',
            { className: 'wc-head', onMouseDown: startDrag },
            h('span', { className: 'wc-logo', 'aria-hidden': 'true' }, '⇄'),
            h(
              'div',
              { className: 'wc-head-text' },
              h('div', { className: 'wc-title' }, t('title')),
              h(
                'div',
                { className: 'wc-sub' },
                h('span', {
                  className:
                    'wc-dot ' +
                    (store.peerRunning ? 'wc-dot-busy' : store.targetId ? 'wc-dot-on' : 'wc-dot-idle'),
                  'aria-hidden': 'true',
                }),
                h('span', null, statusText + ' · ' + t('current') + ' ' + (store.currentATitle || (store.currentA ? shortId(store.currentA) : '—'))),
              ),
            ),
            h(
              'div',
              { className: 'wc-head-actions' },
              store.log.length
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'wc-icon',
                      title: t('clear'),
                      'aria-label': t('clear'),
                      onClick: () => {
                        store.log = []
                        emit()
                      },
                    },
                    '⌫',
                  )
                : null,
              h(
                'button',
                {
                  type: 'button',
                  className: 'wc-icon',
                  title: collapsed ? t('expand') : t('minimize'),
                  'aria-label': collapsed ? t('expand') : t('minimize'),
                  onClick: () => setCollapsed(!collapsed),
                },
                collapsed ? '▢' : '—',
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'wc-icon',
                  title: t('close'),
                  'aria-label': t('close'),
                  onClick: () => {
                    store.open = false
                    persist()
                    dropAllLinks()
                    emit()
                  },
                },
                '×',
              ),
            ),
          ),
          collapsed
            ? null
            : h(
                'div',
                { className: 'wc-body' },
                h(
                  'div',
                  { className: 'wc-picker', 'data-wc-picker': '1' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'wc-select' + (pickerOpen ? ' wc-select-open' : ''),
                      onClick: () => {
                        setPickerOpen(!pickerOpen)
                        setQuery('')
                      },
                      'aria-haspopup': 'listbox',
                      'aria-expanded': pickerOpen ? 'true' : 'false',
                    },
                    h('span', { className: 'wc-select-label' }, peerLabel),
                    h('span', { className: 'wc-chevron', 'aria-hidden': 'true' }, pickerOpen ? '▴' : '▾'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'wc-icon wc-refresh',
                      title: t('refresh'),
                      'aria-label': t('refresh'),
                      onClick: () => refreshSessions(),
                    },
                    '⟳',
                  ),
                  pickerOpen
                    ? h(
                        'div',
                        { className: 'wc-menu' },
                        h('input', {
                          className: 'wc-search',
                          placeholder: t('search'),
                          value: query,
                          autoFocus: true,
                          onChange: (event) => setQuery(event.target.value),
                          onKeyDown: (event) => {
                            if (event.key === 'Escape') {
                              event.stopPropagation()
                              setPickerOpen(false)
                            }
                          },
                        }),
                        h(
                          'div',
                          { className: 'wc-menu-list', role: 'listbox' },
                          store.loadingSessions
                            ? h('div', { className: 'wc-menu-empty' }, t('loading'))
                            : filtered.length
                              ? filtered.map((row) =>
                                  h(
                                    'button',
                                    {
                                      key: row.sessionId,
                                      type: 'button',
                                      role: 'option',
                                      className:
                                        'wc-menu-item' + (row.sessionId === store.targetId ? ' wc-menu-item-on' : ''),
                                      'aria-selected': row.sessionId === store.targetId ? 'true' : 'false',
                                      onClick: () => {
                                        pickTarget(row.sessionId)
                                        setPickerOpen(false)
                                        setQuery('')
                                      },
                                    },
                                    h('span', { className: 'wc-menu-title' }, row.title || shortId(row.sessionId)),
                                    h(
                                      'span',
                                      { className: 'wc-menu-meta' },
                                      (row.updatedAt ? ago(row.updatedAt) : '') + (row.running ? ' · ●' : ''),
                                    ),
                                  ),
                                )
                              : h('div', { className: 'wc-menu-empty' }, t('noMatch')),
                        ),
                      )
                    : null,
                ),
                h(
                  'div',
                  { className: 'wc-log', ref: logRef },
                  bubbles.length
                    ? bubbles
                    : h(
                        'div',
                        { className: 'wc-empty' },
                        h('div', { className: 'wc-empty-icon', 'aria-hidden': 'true' }, '⇄'),
                        h('div', { className: 'wc-empty-title' }, t('emptyTitle')),
                        h('div', { className: 'wc-empty-body' }, t('emptyBody')),
                      ),
                  store.peerRunning ? h('div', { className: 'wc-typing' }, h('span'), h('span'), h('span')) : null,
                ),
                store.error
                  ? h(
                      'div',
                      { className: 'wc-error' },
                      h('span', { className: 'wc-error-text' }, store.error),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'wc-error-close',
                          'aria-label': t('close'),
                          onClick: () => {
                            store.error = null
                            emit()
                          },
                        },
                        '×',
                      ),
                    )
                  : null,
                h(
                  'div',
                  { className: 'wc-compose' },
                  h('textarea', {
                    className: 'wc-input',
                    rows: 2,
                    placeholder: store.targetId ? t('placeholder') : t('placeholderNoTarget'),
                    value: draft,
                    onChange: (event) => setDraft(event.target.value),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                        send()
                      }
                    },
                  }),
                  h(
                    'div',
                    { className: 'wc-actions' },
                    h('span', { className: 'wc-hint' }, 'Enter ↵ / Shift+Enter'),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'wc-send',
                        disabled: !store.targetId || store.busy || !draft.trim(),
                        onClick: send,
                      },
                      store.busy ? t('sending') : t('send'),
                    ),
                  ),
                ),
                h(
                  'div',
                  { className: 'wc-auto' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'wc-switch' + (store.auto ? ' wc-switch-on' : ''),
                      role: 'switch',
                      'aria-checked': store.auto ? 'true' : 'false',
                      disabled: !store.targetId,
                      onClick: toggleAuto,
                    },
                    h('span', { className: 'wc-switch-track' }, h('span', { className: 'wc-switch-knob' })),
                    h('span', { className: 'wc-switch-label' }, store.auto ? t('autoStop') : t('autoStart')),
                  ),
                  h('span', { className: 'wc-auto-info' }, store.hops + ' / ' + store.maxHops),
                  h(
                    'label',
                    { className: 'wc-auto-set' },
                    t('maxRounds'),
                    h('input', {
                      type: 'number',
                      min: 1,
                      max: 20,
                      className: 'wc-num',
                      value: store.maxHops,
                      onChange: (event) => {
                        const value = parseInt(event.target.value, 10)
                        if (!isNaN(value)) {
                          store.maxHops = Math.min(20, Math.max(1, value))
                          persist()
                          emit()
                        }
                      },
                    }),
                  ),
                ),
                h('div', {
                  className: 'wc-resize',
                  title: 'Resize',
                  onMouseDown: startResize,
                }),
              ),
        ),
      )
    }

    const CSS = [
      '.wc-launcher-row{display:flex;justify-content:flex-end;padding:2px 2px 4px}',
      '.wc-launcher{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;transition:color .15s,border-color .15s,background .15s}',
      '.wc-launcher:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.wc-launcher-active{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.wc-launcher-icon{font-size:13px;line-height:1}',
      '.wc-dot{width:6px;height:6px;border-radius:50%;display:inline-block;flex:none}',
      '.wc-dot-idle{background:var(--dsw-alias-state-idle-primary)}',
      '.wc-dot-on{background:var(--dsw-alias-state-success-primary)}',
      '.wc-dot-busy{background:var(--dsw-alias-state-warn-primary);animation:wc-pulse 1.1s ease-in-out infinite}',
      '@keyframes wc-pulse{0%,100%{opacity:1}50%{opacity:.35}}',
      '.wc-window{position:fixed;right:24px;bottom:120px;display:flex;flex-direction:column;z-index:40;border-radius:16px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 24px 60px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.12);font-size:12.5px;line-height:1.55;overflow:hidden}',
      '.wc-collapsed{height:auto!important}',
      '.wc-head{display:flex;align-items:center;gap:9px;padding:10px 8px 10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:move;user-select:none;background:var(--dsw-alias-bg-layer-1)}',
      '.wc-logo{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);color:var(--dsw-alias-brand-primary);font-size:13px;flex:none}',
      '.wc-head-text{min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.wc-title{font-weight:600;font-size:13px;white-space:nowrap}',
      '.wc-sub{display:flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.wc-head-actions{margin-left:auto;display:flex;gap:2px}',
      '.wc-icon{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;cursor:pointer;transition:background .15s,color .15s}',
      '.wc-icon:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.wc-body{display:flex;flex-direction:column;min-height:0;flex:1;position:relative}',
      '.wc-picker{position:relative;display:flex;align-items:center;gap:4px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.wc-select{flex:1;min-width:0;display:flex;align-items:center;gap:6px;height:28px;padding:0 9px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;text-align:left}',
      '.wc-select:hover,.wc-select-open{border-color:var(--dsw-alias-border-l2)}',
      '.wc-select-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.wc-chevron{color:var(--dsw-alias-label-secondary);font-size:10px}',
      '.wc-refresh{flex:none}',
      '.wc-menu{position:absolute;left:10px;right:10px;top:calc(100% - 2px);z-index:6;border-radius:11px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);box-shadow:0 12px 30px rgba(0,0,0,.22);overflow:hidden;display:flex;flex-direction:column;max-height:260px}',
      '.wc-search{width:100%;box-sizing:border-box;height:30px;border:none;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;padding:0 10px;outline:none}',
      '.wc-menu-list{overflow:auto;padding:4px}',
      '.wc-menu-item{display:flex;align-items:baseline;gap:8px;width:100%;padding:6px 8px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;text-align:left}',
      '.wc-menu-item:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.wc-menu-item-on{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}',
      '.wc-menu-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.wc-menu-meta{color:var(--dsw-alias-label-secondary);font-size:10.5px;white-space:nowrap}',
      '.wc-menu-empty{padding:14px 10px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}',
      '.wc-log{flex:1;min-height:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth}',
      '.wc-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:100%;min-height:140px;text-align:center;color:var(--dsw-alias-label-secondary)}',
      '.wc-empty-icon{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:14px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);color:var(--dsw-alias-brand-primary);font-size:20px}',
      '.wc-empty-title{color:var(--dsw-alias-label-primary);font-size:12.5px;font-weight:600}',
      '.wc-empty-body{font-size:11.5px;max-width:250px}',
      '.wc-msg{max-width:86%;padding:7px 10px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);animation:wc-in .16s ease-out}',
      '@keyframes wc-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
      '.wc-msg .wc-meta{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--dsw-alias-label-secondary);margin-bottom:3px}',
      '.wc-msg .wc-text{white-space:pre-wrap;word-break:break-word}',
      '.wc-toB{align-self:flex-end;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent)}',
      '.wc-fromB{align-self:flex-start;background:var(--dsw-alias-bg-layer-1)}',
      '.wc-autoToA,.wc-autoToB{align-self:center;max-width:96%;font-size:11.5px;background:transparent;border-style:dashed;color:var(--dsw-alias-label-secondary)}',
      '.wc-note{align-self:center;color:var(--dsw-alias-label-secondary);font-size:11px;padding:1px 0;text-align:center}',
      '.wc-typing{align-self:flex-start;display:flex;gap:3px;padding:8px 10px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}',
      '.wc-typing span{width:4px;height:4px;border-radius:50%;background:var(--dsw-alias-label-secondary);animation:wc-typing 1.2s infinite}',
      '.wc-typing span:nth-child(2){animation-delay:.15s}.wc-typing span:nth-child(3){animation-delay:.3s}',
      '@keyframes wc-typing{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-2px)}}',
      '.wc-error{display:flex;align-items:flex-start;gap:6px;margin:0 10px 8px;padding:7px 8px;border-radius:9px;color:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-state-error-primary);font-size:11.5px}',
      '.wc-error-text{flex:1;word-break:break-word}',
      '.wc-error-close{border:none;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer;line-height:1;padding:0}',
      '.wc-compose{padding:8px 10px 4px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.wc-input{width:100%;box-sizing:border-box;resize:none;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;padding:8px 10px;outline:none;transition:border-color .15s}',
      '.wc-input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.wc-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end;margin-top:6px}',
      '.wc-hint{color:var(--dsw-alias-label-secondary);font-size:10px;margin-right:auto}',
      '.wc-send{height:28px;padding:0 16px;border-radius:9px;border:none;background:var(--dsw-alias-brand-primary);color:#fff;font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;transition:opacity .15s,transform .1s}',
      '.wc-send:active:not(:disabled){transform:translateY(1px)}',
      '.wc-send:disabled{opacity:.45;cursor:default}',
      '.wc-auto{display:flex;align-items:center;gap:8px;padding:6px 10px 10px}',
      '.wc-switch{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px 0 4px;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer}',
      '.wc-switch:disabled{opacity:.45;cursor:default}',
      '.wc-switch-track{position:relative;display:inline-block;width:28px;height:16px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);transition:background .15s,border-color .15s}',
      '.wc-switch-knob{position:absolute;left:2px;top:1px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .16s,background .16s}',
      '.wc-switch-on{color:var(--dsw-alias-brand-primary)}',
      '.wc-switch-on .wc-switch-track{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent);border-color:var(--dsw-alias-brand-primary)}',
      '.wc-switch-on .wc-switch-knob{transform:translateX(12px);background:var(--dsw-alias-brand-primary)}',
      '.wc-switch-label{white-space:nowrap}',
      '.wc-auto-info{color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.wc-auto-set{margin-left:auto;display:flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.wc-num{width:48px;height:24px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;padding:0 5px}',
      '.wc-resize{position:absolute;left:0;bottom:0;width:16px;height:16px;cursor:nesw-resize;background:linear-gradient(45deg,transparent 45%,var(--dsw-alias-border-l2) 45%,var(--dsw-alias-border-l2) 55%,transparent 55%)}',
      '@media (max-width: 560px){.wc-window{left:8px!important;right:8px!important;top:auto!important;bottom:8px!important;width:auto!important;max-height:70vh}}',
    ].join('')

    return {
      inject: ['slots', 'sessions', 'locale'],
      apply(ctx) {
        bridge.ctx = ctx
        try {
          const snapshot = ctx.locale && typeof ctx.locale.getSnapshot === 'function' ? ctx.locale.getSnapshot() : null
          const id =
            (snapshot && (snapshot.locale || snapshot.id || snapshot.language || snapshot.code)) ||
            (typeof snapshot === 'string' ? snapshot : '') ||
            'zh'
          store.locale = String(id).toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en'
        } catch (_) {
          store.locale = 'zh'
        }
        try {
          if (ctx.locale && typeof ctx.locale.subscribe === 'function') {
            ctx.effect(() =>
              ctx.locale.subscribe(() => {
                try {
                  const snapshot = ctx.locale.getSnapshot()
                  const id = snapshot && (snapshot.locale || snapshot.id || snapshot.language || snapshot.code)
                  if (id) store.locale = String(id).toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en'
                } catch (_) {
                  /* keep current language */
                }
                emit()
              }),
            )
          }
        } catch (_) {
          /* locale is optional */
        }

        store.pos = saved.pos && typeof saved.pos.x === 'number' && typeof saved.pos.y === 'number' ? saved.pos : null
        store.size = saved.size && typeof saved.size.w === 'number' && typeof saved.size.h === 'number' ? saved.size : null

        if (saved.seeded !== true) persist()

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register({ name: 'conversation.composer.dock', id: 'window-chat.launcher', order: 9 }, Launcher),
        )
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'window-chat.window', order: 60 }, FloatingWindow),
        )
      },
    }
  },
})