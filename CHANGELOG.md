- Fixed: Errors connecting to the update server should be logged only to the dev console #8
- Fixed: Dragging the taskbar does not work (拖动任务栏不工作 #6)
- Fixed: App shouldn't auto-minimize while selenium task is running #9
- Fixed: Changing nikuLink in settings requires application to be reloaded/restarted #12
- Feature: Date-Range-Picker instead of 2x Date-Picker #14
- Fixed: Clarity-table: hightlighter hover row #17
- Feature: Make timeslices draggable between days in calendar #15

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
