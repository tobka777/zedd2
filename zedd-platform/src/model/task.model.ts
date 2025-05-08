export interface Task {
  sortNo?: number //deprecated
  name: string
  strId?: string //deprecated
  projectName: string
  intId: number
  start: Date | null
  end: Date | null
  openForTimeEntry?: boolean //deprecated
  projectIntId?: string //deprecated
  taskCode?: string //deprecated
  typ: 'CLARITY' | 'OTT' | 'REPLICON' //deprecated
}
