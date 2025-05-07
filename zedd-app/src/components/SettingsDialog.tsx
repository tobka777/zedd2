import {
  Autocomplete,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormLabel,
  Grid,
  IconButton,
  InputAdornment,
  Radio,
  RadioGroup,
  Switch,
  TextField,
  Tooltip,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { dialog } from '@electron/remote'
import { MoreHoriz as PickFileIcon } from '@mui/icons-material'
import { observer } from 'mobx-react-lite'
import { uniq } from 'lodash'

import { PlatformState } from '../PlatformState'
import { ZeddSettings } from '../ZeddSettings'
import { toggle, useDebouncedCallback } from '../util'
import { countries, federalStates } from '../holidays'

// const _inExternal = (e: React.MouseEvent<HTMLAnchorElement>) => {
//   openExternal(e.currentTarget.href)
//   e.preventDefault()
// }

export const SettingsDialog = observer(
  ({
    done,
    platformState,
    settings,
    checkCgJira,
    checkChromePath,
  }: {
    done: () => void
    platformState: PlatformState
    settings: ZeddSettings
    checkCgJira: (cgJira: ZeddSettings['cgJira']) => Promise<any>
    checkChromePath: () => Promise<{
      chromeVersion: string
      chromeDriverVersion: string
    }>
  }) => {
    const [chromeStatus, setChromeStatus] = useState(
      {} as {
        error?: any
        ok?: {
          chromeVersion: string
          chromeDriverVersion: string
        }
        checking?: true
      },
    )
    const [cgJiraStatus, setCgJiraStatus] = useState(
      {} as { error?: any; ok?: true; checking?: true },
    )

    const [textFieldNikuLink, setTextFieldNikuLink] = useState(settings.nikuLink)

    const theme = useTheme()

    const updateChromeStatusDebounced = useDebouncedCallback(
      () => {
        setChromeStatus({ checking: true })
        checkChromePath()
          .then((versions) => setChromeStatus({ ok: versions }))
          .catch((error) => setChromeStatus({ error }))
      },
      [checkChromePath],
      1000,
    )

    useEffect(updateChromeStatusDebounced, [updateChromeStatusDebounced])

    const checkCgJiraDebounced = useDebouncedCallback(
      () => {
        const cgJira = settings.cgJira
        if (cgJira.url && settings.cgJira.token) {
          setCgJiraStatus({ checking: true })
          checkCgJira(cgJira)
            .then(() => setCgJiraStatus({ ok: true }))
            .catch((error) => setCgJiraStatus({ error }))
        }
      },
      [checkCgJira, settings],
      1000,
    )

    const projects = uniq([...platformState.projectNames, ...settings.excludeProjects])
    projects.sort()

    function updateWorkmask(newValueofHours: number) {
      const actualSumOfHours = settings.workmask.reduce(
        (total, day) => (total = total + day.valueOf()),
        0,
      )
      const workingDays = settings.workmask.slice(0, 5)
      const valueToChange =
        newValueofHours - actualSumOfHours > 0 ? Math.min(...workingDays) : Math.max(...workingDays)
      const indexToChange = workingDays.indexOf(valueToChange)

      const value = newValueofHours < actualSumOfHours ? -1 : 1

      settings.workmask[indexToChange] = settings.workmask[indexToChange] + value
    }

    function changeDayHours(dayHours: number): number {
      return dayHours < 0 ? 0 : dayHours > 12 ? 12 : dayHours
    }

    return (
      <Dialog
        open={true}
        onClose={(_) => done()}
        aria-labelledby='form-dialog-title'
        maxWidth='md'
        fullWidth
      >
        <DialogTitle id='config-dialog-title'>Settings</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={4}>
              <FormLabel>Hour Mask</FormLabel>
              <div style={{ fontSize: 'small' }}>Regular worktimes. Used for sick/holidays.</div>
            </Grid>
            <Grid item xs={8}>
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, di) => (
                <TextField
                  key={d}
                  placeholder={d}
                  size='small'
                  style={{ width: '3em' }}
                  type='number'
                  value={settings.workmask[di]}
                  onChange={(e) =>
                    (settings.workmask[di] = +changeDayHours(parseInt(e.target.value)))
                  }
                />
              ))}
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Weekly Working Time</FormLabel>
            </Grid>
            <Grid item xs={8} component={'label'}>
              <TextField
                type='number'
                value={settings.workmask.reduce((total, day) => (total = total + day.valueOf()), 0)}
                onChange={(e) => updateWorkmask(parseInt(e.target.value))}
                InputProps={{
                  endAdornment: <InputAdornment position='end'>hours</InputAdornment>,
                }}
                inputProps={{ min: 1, max: 168, step: 1 }}
              />
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Start Hour</FormLabel>
              <div style={{ fontSize: 'small' }}>
                First hour of the calendar by default, as well as start hour for holidays etc.
              </div>
            </Grid>
            <Grid item xs={8}>
              <TextField
                type='number'
                value={settings.startHour}
                onChange={(e) => (settings.startHour = +e.target.value)}
                InputProps={{
                  endAdornment: <InputAdornment position='end'>:00</InputAdornment>,
                }}
                inputProps={{ min: 1, max: 60, step: 1 }}
              />
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Min Idle Time</FormLabel>
              <div style={{ fontSize: 'small' }}>
                Minimum user idle time in minutes which counts as "user is away".
              </div>
            </Grid>
            <Grid item xs={8}>
              <TextField
                type='number'
                value={settings.minIdleTimeMin}
                onChange={(e) => (settings.minIdleTimeMin = +e.target.value)}
                InputProps={{
                  endAdornment: <InputAdornment position='end'>minutes</InputAdornment>,
                }}
                inputProps={{ min: 1, max: 60, step: 1 }}
              />
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Keep Always On Top</FormLabel>
              <div style={{ fontSize: 'small' }}>
                Will minimize to always-on-top after losing focus.
              </div>
            </Grid>
            <Grid item xs={8} component={'label'}>
              <RadioGroup
                row
                value={'' + settings.keepHovering}
                onChange={(event) => {
                  const v = event.target.value
                  settings.keepHovering = (
                    { false: false, true: true, vertical: 'vertical' } as const
                  )[v]!
                }}
              >
                <FormControlLabel value='false' control={<Radio />} label='No' />
                <FormControlLabel value='true' control={<Radio />} label='Horizontal' />
                <FormControlLabel value='vertical' control={<Radio />} label='Vertical' />
              </RadioGroup>
              {/* <Checkbox
                checked={settings.keepHovering}
                onChange={(_, checked) => (settings.keepHovering = !!checked)}
              /> */}
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Time Format</FormLabel>
            </Grid>
            <Grid item xs={8} component={'label'}>
              BT
              <Switch
                checked={'hours' === settings.timeFormat}
                onChange={(_, checked) => (settings.timeFormat = checked ? 'hours' : 'bt')}
              />
              Hours:Minutes
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Platform URL</FormLabel>
            </Grid>
            <Grid item xs={8}>
              <TextField
                placeholder='http://example.com/niku/nu'
                style={{ width: '100%' }}
                value={textFieldNikuLink}
                onChange={(e) => {
                  setTextFieldNikuLink(e.target.value)
                  settings.nikuLink = e.target.value.trim()
                }}
              />
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Open Chrome in</FormLabel>
            </Grid>
            <Grid item xs={8} component={'label'}>
              Foreground
              <Switch
                checked={!!settings.chromeHeadless}
                onChange={(_, checked) => (settings.chromeHeadless = !!checked)}
              />
              Background
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Location (for public holidays)</FormLabel>
            </Grid>
            <Grid item xs={8}>
              <Autocomplete
                options={countries}
                value={settings.location}
                isOptionEqualToValue={(option, value) => option.code === value.code}
                onChange={(_, newCountrie) => {
                  settings.location = newCountrie
                  if (newCountrie?.code !== 'DE') {
                    settings.federalState = null
                  } else {
                    settings.federalState = { label: '', code: '' }
                  }
                }}
                renderOption={(props, option) => (
                  <li {...props}>
                    <div>{option.label}</div>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label='Choose a country'
                    inputProps={{
                      ...params.inputProps,
                    }}
                  />
                )}
              ></Autocomplete>
            </Grid>
            <Grid item xs={4}>
              <FormLabel>Federal State</FormLabel>
            </Grid>
            <Grid item xs={8}>
              <Autocomplete
                style={{
                  display: settings.location && settings.location.code === 'DE' ? 'block' : 'none',
                }}
                options={federalStates}
                value={settings.federalState}
                isOptionEqualToValue={(option, value) => option.code === value.code}
                onChange={(_, newState) => {
                  settings.federalState = newState
                }}
                renderOption={(props, option) => (
                  <li {...props}>
                    <div>{option.label}</div>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label='Choose your state'
                    inputProps={{
                      ...params.inputProps,
                    }}
                  />
                )}
              ></Autocomplete>
            </Grid>
            <Grid item xs={4}>
              <FormLabel>Ersatz Task</FormLabel>
            </Grid>
            <Grid item xs={8}>
              <TextField
                value={settings.ersatzTask}
                onChange={(e) => (settings.ersatzTask = e.target.value.trim())}
              />
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Platform Projects To Ignore</FormLabel>
              <div style={{ fontSize: 'small' }}>
                Define platform projects whoses tasks should not be imported.
              </div>
            </Grid>
            <Grid item xs={8}>
              {projects.map((x) => (
                <FormControlLabel
                  key={x}
                  style={{ display: 'block' }}
                  control={
                    <Checkbox
                      checked={settings.excludeProjects.includes(x)}
                      value={x}
                      onChange={(e) => toggle(settings.excludeProjects, e.target.value)}
                    />
                  }
                  label={x}
                />
              ))}
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Platform Ressource Name</FormLabel>
              <div style={{ fontSize: 'small' }}>Leave this empty.</div>
            </Grid>
            <Grid item xs={8}>
              <TextField
                value={settings.platformResourceName}
                onChange={(e) => (settings.platformResourceName = e.target.value)}
              />
            </Grid>

            <Grid item xs={4}>
              <FormLabel>PL JIRA</FormLabel>
              <div style={{ fontSize: 'small' }}>
                Leave blank if not relevant. If necessary, add required root certificates to the
                windows root certificate store.
              </div>
            </Grid>
            <Grid item xs={8}>
              <TextField
                label='URL'
                placeholder='http://...'
                style={{ width: '100%' }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position='end'>secure/Dashboard.jspa</InputAdornment>
                  ),
                }}
                value={settings.cgJira.url}
                onChange={(e) => {
                  settings.cgJira.url = e.target.value.trim()
                  checkCgJiraDebounced()
                }}
              />
            </Grid>

            <Grid item xs={4}></Grid>
            <Grid item xs={8}>
              <TextField
                label='Personal Access Token'
                style={{ width: '95%' }}
                value={settings.cgJira.token}
                onChange={(e) => {
                  settings.cgJira.token = e.target.value.trim()
                  checkCgJiraDebounced()
                }}
              />
              {cgJiraStatus.checking ? (
                <CircularProgress size='0.8em' />
              ) : cgJiraStatus.ok ? (
                '✅'
              ) : cgJiraStatus.error ? (
                <Tooltip title={'' + cgJiraStatus.error}>
                  <span style={{ cursor: 'help' }}>❌</span>
                </Tooltip>
              ) : null}
            </Grid>

            <Grid item xs={4}>
              <FormLabel>JIRA 2</FormLabel>
              <div style={{ fontSize: 'small' }}>
                If task names contain JIRA keys which are not from projects in the above JIRA, this
                URL will be used to generate links instead.
              </div>
            </Grid>
            <Grid item xs={8}>
              <TextField
                label='URL'
                placeholder='http://...'
                style={{ width: '100%' }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position='end'>secure/Dashboard.jspa</InputAdornment>
                  ),
                }}
                value={settings.jira2.url}
                onChange={(e) => (settings.jira2.url = e.target.value.trim())}
              />
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Chrome Path</FormLabel>
            </Grid>
            <Grid item xs={8} style={{ minHeight: '4em' }}>
              <TextField
                placeholder='http://example.com/niku/nu'
                style={{ width: '100%' }}
                value={settings.chromePath}
                onChange={(e) => {
                  settings.chromePath = e.target.value
                  updateChromeStatusDebounced()
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position='end'>
                      <IconButton
                        aria-label='toggle password visibility'
                        size='small'
                        onClick={async () => {
                          const result = await dialog.showOpenDialog({
                            defaultPath: settings.chromePath,
                            filters: [{ name: 'Executable', extensions: ['exe'] }],
                            properties: ['openFile'],
                          })
                          if (result.filePaths[0]) {
                            settings.chromePath = result.filePaths[0]
                            updateChromeStatusDebounced()
                          }
                        }}
                        edge='end'
                      >
                        <PickFileIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              {chromeStatus.error ? (
                <span style={{ color: theme.palette.error.main }}>{'' + chromeStatus.error}</span>
              ) : chromeStatus.ok ? (
                <span style={{ color: theme.palette.success.main }}>
                  OK! Chrome Version: {chromeStatus.ok.chromeVersion}, Chrome Driver Version:{' '}
                  {chromeStatus.ok.chromeDriverVersion}
                </span>
              ) : (
                <CircularProgress size='0.8em' />
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => updateChromeStatusDebounced()}>Recheck Chrome</Button>
          <Button onClick={(_) => done()} color='primary'>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    )
  },
)
