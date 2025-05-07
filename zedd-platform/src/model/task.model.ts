export interface Task {
  sortNo?: number //entfernen
  name: string
  strId?: string //deprecated
  projectName: string
  intId: number
  start: Date | null
  end: Date | null
  openForTimeEntry?: boolean //entfernen
  projectIntId?: string //?entfernen ? Zeichnen
  taskCode?: string //?entfernen ? Zeichnen
  typ?: 'CLARITY' | 'OTT' | 'REPLICON' //?entfernen ? Zeichnen
}
