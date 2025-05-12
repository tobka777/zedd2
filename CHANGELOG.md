## [3.0.1] - 2025-05-12

- Fix: Configuration for Chrome Path

## [3.0.0] - 2025-05-09

- Feature: Import tasks from OTT

## [2.12.4] - 2024-09-20

- Fix: Error messages are closable

## [2.12.3] - 2024-08-28

- Fix: Automatischer Chromedriver Update funktioniert nicht mehr

## [2.12.2] - 2023-10-24

- Fix: Jira Authentification with Personal Access Token

## [2.12.1] - 2023-09-08

- Fix: invalid time value in Clarity Export
- Fix: Update Download-Url for Chrome 115 or newer

## [2.12.0] - 2023-05-04

- Feature: Copy & Paste Tasks
- Fix: Minimize, fullscreen and close button always visible
- Feature: Support for MacOS including shortcuts
- Feature: Release Workflow with Github Action

## [2.11.0] - 2022-09-15

- Feature: Undoing slice operation also updates element to previous state when it was earlier automatically cutted
- Feature: Import/export buttons visual aspects changed, added cancel buttons for cancelling these operations during their lifetime
- Feature: Dependencies updated
- Feature: Added minimize window to task bar and close to windows tray function
- Feature: Added headless mode for Selenium Browser to start in the background (configurable)
- Feature: Log error messages in logfile located in `~/zedd/log/`.
- Feature: Marking many tasks simultaneously and operting on them - delete and change task operation.
- Feature: Chose default weekly working hours and working mask in settings

## [2.10.0] - 2022-03-14

- Feature: Changed the color of the days in calendar. Weekend and holidays are highlited.
- Fixed: Exclude mobx-administration of dates in undoer.

## [2.9.2] - 2022-03-02

- Feature: Undo (Ctrl+Z) and Redo (Ctrl+Y)
- Feature: Added a filter for searching projects in the clarity view
- Feature: Added a new dropdown item 'NEW' in import button menu, to import only projects which have not been imported yet
- Feature: Added the path of chrome and chromedriver in the settings dialog
- Feature: ERSATZ button now takes into account public holidays. **Configure your location in the settings to enable this**.

## [2.9.1] - 2022-02-04

- Fixed: DateRangePicker starts at monday
- Fixed: Arrow-Buttons add or sub full months or years, not only the amount of days that were selected
- Fixed: Formatting in the header of the calendar
- Feature: Add year button in the GUI that shows the current year
- Feature: Add tooltip for every cell in the foot row
- Feature: Seperate the next month button into three buttons. The new buttons are last, month and next
- Feature: Add copy-task button, to copy the taskname in the taskcomment area
- Delete: MAGIC from titlebar menu
- Update: New order for the suggested tasks in the taskslice menu
- Feature: Change the task of a slice to the lattest used task by ALT + right click on the taskslice
- Fixed update server URL

## [2.9.0] - 2022-01-19

- Fixed: Errors connecting to the update server should be logged only to the dev console #8
- Fixed: Dragging the taskbar does not work (拖动任务栏不工作 #6)
- Fixed: App shouldn't auto-minimize while selenium task is running #9
- Fixed: Changing nikuLink in settings requires application to be reloaded/restarted #12
- Feature: Date-Range-Picker instead of 2x Date-Picker #14
- Fixed: Clarity-table: hightlighter hover row #17
- Feature: Make timeslices draggable between days in calendar #15
- Update dependecies

## [2.8.0] - 2020-12-13

- Trim nikuLink in settings dialog automatically.
- Added "Resource Name" option. You can ignore this.
- Don't output hours in clarity comments.
- Added check that next/prev slice is on same day for eat slice function.

## [2.7.4] - 2020-11-06

- Fixed import menu not opening.

## [2.7.3] - 2020-11-02

- Tasks which have been rounded to zero time will no longer show up clarity view (and will no longer result in empty comments being exported to clarity).

## [2.7.2] - 2020-10-07

- Clarity tasks import: fixed bug when number of projects was so high that there were multiple pages.
- Clarity tasks import: fixed bug when a project was favorited.
- Comments for multiple days on the same clarity account are now written as a single comment, separated by newlines.

## [2.7.1] - 2020-08-12

- Notifications now disappear properly when multiple are triggered subsequently.
- Constrained window bounds properly in minimized mode.

## [2.7.0] - 2020-08-04

- Days with no slices are correctly emptied in clarity when exporting.
- Minor bugfixes and performance improvements.
- Made notifications non-interactive because the required node native module was more hassle than it was worth.

## [2.6.0] - 2020-07-17

- Calendar is hidden if the selected interval is larger than 31 days.
- The "clarity view" groups columns by day/week/month/year, depending on the selected interval. Selecting large intervals is useful to see the total booked time to a particular account.
- Fixed: GUESS-Button: `FOO-11` no longer matches clarity-task containing `FOO-111`.

## [2.5.0] - 2020-07-12

- "Hover mode" now has a vertical option. See settings to enable.
- Added "What's New" dialog.

## [2.4.1] - 2020-07-06

- Fixed links to main Jira not working.

## [2.4.0] - 2020-07-03

- You can now right click on slices in the calender to go to that tasks Jira page in your browser.
- You can now add a second Jira URL, which will be used if Jira keys found in task names do not match a project from the main Jira.
- Task select autocomplete now shows when it is searching for tasks in Jira.
- Added "GUESS" button, which attempts to auto-fill the clarity task. (Currently it only looks for a Jira key in task names and attempts to match that to a clarity task.)

## [2.3.0] - 2020-05-27

- Time format can be toggled between hours and BT in settings.
- Show target time in clarity view (hover over total hours).
- Fix app not quitting correctly.
