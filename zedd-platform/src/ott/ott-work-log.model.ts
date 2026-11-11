// Is the raw, unmapped return type from OTT.

export interface OttWorkLogResponse {
  data: OttWorkLogData[]
}

export interface OttExportMaps {
  issueMap: Map<number, OttAssignedIssue>
  projectMap: Map<number, OttProjectCode>
  existingMap: Map<string, OttTimeEntry>
}

export interface OttWorkLogData {
  assignedIssues: OttAssignedIssue[]
  assoBoardProjectCodes: OttProjectCode[]
  timeEntries: OttTimeEntry[]
}

export interface OttAssignedIssue {
  title: string
  appointmentId: number
  projectCode: number
  engagementId: number
  stickyNoteId: number
}

export interface OttProjectCode {
  projectCodeId: number
  gfsProjectCode: number
  gtmProjectName: string
  gfsTaskCode: string
  boardId?: number
}

export interface OttTimeEntry {
  id: number
  appointmentId: number
  dateLogged: number
  hoursLogged: number
  stickyNoteId: number
  engagementId: number
  boardId: number
  loggedFor: number
  trackingType: number
  issueName: string
  description: string
  workLocationId?: number
  workPlaceId?: number
}

export interface OttDeleteTimeEntry {
  id: number
  appointmentId: number
  stickyNoteId: number
  dateLogged: number
  hoursLogged: number
  description: string
  loggedFor: number
  trackingType: number
  boardId: number
  engagementId: number
  originalValues: {
    'Issue Name': string
    'Issue Id': number
    Date: number
    Duration: number
    Description: string
    'Logged For': number
    'Work Location': number
    'Place of Work': number
  }
  workLocationId: number
  workPlaceId: number
  reason: string
}
