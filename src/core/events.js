// Minimal event bus. Game systems emit events ("stole", "hit", "bellRing"...) and tasks listen.
export class EventBus {
  constructor() {
    this.map = new Map();
    this.any = [];
  }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, []);
    this.map.get(type).push(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) {
    const list = this.map.get(type);
    if (list) {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
  }
  onAny(fn) {
    this.any.push(fn);
  }
  emit(type, data = {}) {
    data.type = type;
    const list = this.map.get(type);
    if (list) for (const fn of list.slice()) fn(data);
    for (const fn of this.any) fn(data);
  }
  clear() {
    this.map.clear();
    this.any = [];
  }
}
