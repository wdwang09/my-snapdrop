export class PublicEvent {
  static fire(type: string, detail: Object) {
    // https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent
    window.dispatchEvent(new CustomEvent(type, { detail: detail }));
  }

  static on(type: string, callback: EventListenerOrEventListenerObject) {
    return window.addEventListener(type, callback, false);
  }
}
