import { createApp } from 'vue'
import App from './App.vue'
import './assets/less/index.less'
import { startMock } from '@/mock'
import router from './router'
import mixin from './utils/mixin'
import VueLazyload from '@jambonn/vue-lazyload'
import { createPinia } from 'pinia'
import { useClick } from '@/utils/hooks/useClick'
import bus, { EVENT_KEY } from '@/utils/bus'

window.isMoved = false
window.isMuted = true
window.showMutedNotice = true

const vClick = useClick()
const pinia = createPinia()
const app = createApp(App)
app.mixin(mixin)
const loadImage = new URL('./assets/img/icon/img-loading.png', import.meta.url).href
app.use(VueLazyload, {
  preLoad: 1.3,
  loading: loadImage,
  attempt: 1
})
app.use(pinia)
app.use(router)
app.directive('click', vClick)

async function bootstrap() {
  // Register the fail-closed authorized recommendation source before any page requests data.
  await startMock()
  app.mount('#app')
  setTimeout(() => {
    bus.emit(EVENT_KEY.HIDE_MUTED_NOTICE)
    window.showMutedNotice = false
  }, 2000)
  bus.on(EVENT_KEY.REMOVE_MUTED, () => {
    window.isMuted = false
  })
}

void bootstrap()
