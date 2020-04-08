import {
  observable,
  IReactionDisposer,
  reaction,
  observe,
  IObservableArray,
  transaction,
  ObservableMap,
} from 'mobx'

function bagRemove(arr: any[], index: number) {
  if (index >= arr.length) throw new Error()

  console.log('bagRemove', arr.length, arr, index)
  arr[index] = arr[arr.length - 1]
  arr.length--
}

interface GrouperItemInfo {
  groupByValue: any
  reaction: IReactionDisposer
  grouperArrIndex: number
}

export class ObservableGroupMap<G, T> extends ObservableMap<G, IObservableArray<T>> {
  private readonly keyToName: (group: G) => string

  private readonly groupBy: (x: T) => G

  private readonly grouperInfoKey: symbol

  private readonly base: IObservableArray<T>

  clear(): void {
    throw new Error('not supported')
  }

  delete(_key: G): boolean {
    throw new Error('not supported')
  }

  set(_key: G, _value: IObservableArray<T>): this {
    throw new Error('not supported')
  }

  private _getGroupArr(key: G) {
    let result = super.get(key)
    if (undefined === result) {
      result = observable([], { name: `GroupArray[${this.keyToName(key)}]` })
      super.set(key, result)
    }
    return result
  }

  private _removeFromGroupArr(key: G, itemIndex: number) {
    const arr = this.get(key)!
    if (1 === arr.length) {
      super.delete(key)
    } else if (itemIndex === arr.length - 1) {
      // last position in array
      arr.length--
    } else {
      arr[itemIndex] = arr[arr.length - 1]
      arr[itemIndex][this.grouperInfoKey].grouperArrIndex = itemIndex
      arr.length--
    }
  }

  private checkState() {
    for (const key of this.keys()) {
      const arr = this.get(key)!
      for (let i = 0; i < arr!.length; i++) {
        const item = arr[i]
        const info: GrouperItemInfo = item[this.grouperInfoKey]
        if (info.grouperArrIndex != i) {
          throw new Error(info.grouperArrIndex + ' ' + i)
        }
        if (info.groupByValue != key) {
          throw new Error(info.groupByValue + ' ' + key)
        }
      }
    }
  }

  private _addItem(item: any) {
    const groupByValue = this.groupBy(item)
    const groupArr = this._getGroupArr(groupByValue)
    const value: GrouperItemInfo = {
      groupByValue: groupByValue,
      grouperArrIndex: groupArr.length,
      reaction: reaction(
        () => this.groupBy(item),
        (newGroupByValue, _r) => {
          console.log('new group by value ', newGroupByValue)
          const grouperItemInfo = (item as any)[this.grouperInfoKey]
          this._removeFromGroupArr(grouperItemInfo.groupByValue, grouperItemInfo.grouperArrIndex)

          const newGroupArr = this._getGroupArr(groupByValue)
          const newGrouperArrIndex = newGroupArr.length
          newGroupArr.push(item)
          grouperItemInfo.groupByValue = newGroupByValue
          grouperItemInfo.grouperArrIndex = newGrouperArrIndex
          this.checkState()
        },
      ),
    }
    Object.defineProperty(item, this.grouperInfoKey, {
      configurable: true,
      enumerable: false,
      value,
    })
    groupArr.push(item)
    this.checkState()
  }

  private _removeItem(item: any) {
    this.checkState()
    const grouperItemInfo: GrouperItemInfo = (item as any)[this.grouperInfoKey]
    this._removeFromGroupArr(grouperItemInfo.groupByValue, grouperItemInfo.grouperArrIndex)
    grouperItemInfo.reaction()

    delete (item as any)[this.grouperInfoKey]
    this.checkState()
  }

  constructor(
    base: IObservableArray<T>,
    groupBy: (x: T) => G,
    { name, keyToName = (x) => '' + x }: { name?: string; keyToName?: (group: G) => string } = {},
  ) {
    super()
    this.keyToName = keyToName
    this.groupBy = groupBy
    this.grouperInfoKey = Symbol('grouperInfo' + name)
    this.base = base

    for (let i = 0; i < base.length; i++) {
      const item = base[i]
      this._addItem(item)
    }

    observe(base, (change) => {
      if ('splice' === change.type) {
        transaction(() => {
          for (const removed of change.removed) {
            this._removeItem(removed)
          }
          for (const added of change.added) {
            this._addItem(added)
          }
        })
      } else if ('update' === change.type) {
        transaction(() => {
          this._removeItem(change.oldValue)
          this._addItem(change.newValue)
        })
      } else {
        throw new Error('illegal state')
      }
    })
  }
  dispose() {
    for (let i = 0; i < this.base.length; i++) {
      const item = this.base[i]
      const grouperItemInfo: GrouperItemInfo = (item as any)[this.grouperInfoKey]
      grouperItemInfo.reaction()

      delete (item as any)[this.grouperInfoKey]
      this._addItem(item)
    }
  }
}

// type Slice = { day: string; hours: number }

// const base = observable(
//   [
//     { day: "mo", hours: 3 },
//     { day: "mo", hours: 3 },
//     { day: "tu", hours: 3 },
//     { day: "we", hours: 3 },
//   ],
//   { name: "base" }
// )

// const slicesByDay: Map<string, Slice[]> = new ObservableGroupMap(
//   base,
//   (s) => s.day
// )

// const dayHours = createTransformer(
//   (day: string) => {
//     trace()
//     return slicesByDay.get(day)!.reduce((a, b) => a + b.hours, 0)
//   },
//   { debugNameGenerator: (x) => x + "Hours" }
// )

// const mapToObj = (map: Map<any, any>) =>
//   Array.from(map.keys()).reduce(
//     (r, key) => ((r[key] = slicesByDay.get(key)), r),
//     {} as any
//   )

// const dispose = autorun(() => {
//   trace()
//   untracked(() => console.log(JSON.stringify(mapToObj(slicesByDay))))
//   console.log("moHours", dayHours("mo"))
//   console.log("tuHours", dayHours("tu"))
// })

// console.log(
//   "getDependencyTree",
//   JSON.stringify(getDependencyTree(dispose), null, "    ")
// )

// console.log(">> add tu 4")
// base.push({ day: "tu", hours: 4 })

// console.log(">> remove we slice")
// base.splice(3, 1)

// console.log(">> set first mo slice hours")
// base[0].hours = 12

// console.log(">> replace tu slice")
// base[2] = { day: "tu", hours: 4.5 }
