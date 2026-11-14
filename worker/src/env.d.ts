declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher
    ROOMS: DurableObjectNamespace<import('./room-hub').RoomHub>
  }
  interface GlobalProps {
    mainModule: typeof import('./index')
    durableNamespaces: 'RoomHub'
  }
}
