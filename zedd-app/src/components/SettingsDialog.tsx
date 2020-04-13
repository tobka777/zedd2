import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  FormLabel,
  CircularProgress,
  Grid,
  InputAdornment,
  Checkbox,
  FormControlLabel,
  Tooltip,
  Button,
} from '@material-ui/core'
import { useTheme } from '@material-ui/core/styles'
import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { remote } from 'electron'
import { observer } from 'mobx-react-lite'
import { uniq, debounce } from 'lodash'

import {
  getCurrentChromeDriverVersion,
  getLatestChromeDriverVersion,
  getChromeVersion,
  installChromeDriver,
} from '../chromeDriverMgmt'
import { ClarityTaskSelect } from './ClarityTaskSelect'
import { ClarityState } from '../ClarityState'
import { ZeddSettings } from '../ZeddSettings'
import { toggle } from '../util'
import { color } from 'chroma.ts'

const { openExternal } = remote.shell

const inExternal = (e: React.MouseEvent<HTMLAnchorElement>) => {
  openExternal(e.currentTarget.href)
  e.preventDefault()
}

export const SettingsDialog = observer(
  ({
    done,
    clarityState,
    settings,
    checkCgJira,
  }: {
    done: () => void
    clarityState: ClarityState
    settings: ZeddSettings
    checkCgJira: (cgJira: ZeddSettings['cgJira']) => Promise<any>
  }) => {
    const [chromeVersion, setChromeVersion] = useState({} as { error?: any; value?: string })
    const [installedDriverVersion, setInstalledDriverVersion] = useState(
      {} as { error?: any; value?: string },
    )
    const [latestDriverVersion, setLatestDriverVersion] = useState(
      {} as { error?: any; value?: string },
    )
    const [cgJiraStatus, setCgJiraStatus] = useState(
      {} as { error?: any; ok?: true; checking?: true },
    )

    const theme = useTheme()

    const updateVersions = () => {
      setChromeVersion({})
      setInstalledDriverVersion({})
      setLatestDriverVersion({})

      getChromeVersion()
        .then((value) => {
          setChromeVersion({ value })
          getLatestChromeDriverVersion(value)
            .then((value) => setLatestDriverVersion({ value }))
            .catch((error) => setLatestDriverVersion({ error }))
        })
        .catch((error) => setChromeVersion({ error }))
      getCurrentChromeDriverVersion()
        .then((value) => setInstalledDriverVersion({ value }))
        .catch((error) => setInstalledDriverVersion({ error }))
    }

    useEffect(updateVersions, [])

    const checkCgJiraDebounced = useCallback(
      debounce(() => {
        const cgJira = settings.cgJira
        if (cgJira.url && settings.cgJira.username && settings.cgJira.password) {
          setCgJiraStatus({ checking: true })
          checkCgJira(cgJira)
            .then(() => setCgJiraStatus({ ok: true }))
            .catch((error) => setCgJiraStatus({ error }))
        }
      }, 2000),
      [checkCgJira],
    )

    const canInstall =
      latestDriverVersion.value && latestDriverVersion.value !== installedDriverVersion.value

    const projects = uniq([...clarityState.projectNames, ...settings.excludeProjects])
    projects.sort()

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
                  placeholder={d}
                  size='small'
                  style={{ width: '3em' }}
                  type='number'
                  value={settings.workmask[di]}
                  onChange={(e) => (settings.workmask[di] = +e.target.value)}
                />
              ))}
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
                Mininum user idle time in minutes which counts as "user is away".
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
              <Checkbox
                checked={settings.keepHovering}
                onChange={(_, checked) => (settings.keepHovering = !!checked)}
              />
            </Grid>
            <Grid item xs={4}>
              <FormLabel>Clarity URL</FormLabel>
            </Grid>
            <Grid item xs={8}>
              <TextField
                placeholder='http://example.com/niku/nu'
                style={{ width: '100%' }}
                value={settings.nikuLink}
                onChange={(e) => (settings.nikuLink = e.target.value)}
              />
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Clarity Holiday Account</FormLabel>
            </Grid>
            <Grid item xs={8}>
              <ClarityTaskSelect
                clarityState={clarityState}
                value={settings.urlaubClarityTaskIntId}
                onChange={(newIntId) => (settings.urlaubClarityTaskIntId = newIntId)}
              />
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
              <FormLabel>Clarity Projects To Ignore</FormLabel>
              <div style={{ fontSize: 'small' }}>
                Define clarity projects whoses tasks should not be imported.
              </div>
            </Grid>
            <Grid item xs={8}>
              {projects.map((x) => (
                <FormControlLabel
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
              <FormLabel>PL JIRA</FormLabel>
              <div style={{ fontSize: 'small' }}>Leave blank if not relevant.</div>
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
                label='Username'
                style={{ marginRight: 8 }}
                value={settings.cgJira.username}
                onChange={(e) => {
                  settings.cgJira.username = e.target.value.trim()
                  checkCgJiraDebounced()
                }}
              />
              <TextField
                label='Password'
                type='password'
                value={Buffer.from(settings.cgJira.password, 'base64').toString('utf8')}
                onChange={(e) => {
                  settings.cgJira.password = Buffer.from(e.target.value, 'utf8').toString('base64')
                  checkCgJiraDebounced()
                }}
              />
              {cgJiraStatus.checking ? (
                <CircularProgress size='0.8em' />
              ) : cgJiraStatus.ok ? (
                '✔️'
              ) : cgJiraStatus.error ? (
                <Tooltip title={'' + cgJiraStatus.error}>
                  <span style={{ cursor: 'help' }}>❌</span>
                </Tooltip>
              ) : null}
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Current Chrome Version</FormLabel>
              <div style={{ fontSize: 'small' }}>Must be on the PATH.</div>
            </Grid>
            <Grid item xs={8} style={{ minHeight: '4em' }}>
              {chromeVersion.error ? (
                <span style={{ color: theme.palette.error.main }}>
                  {'' + chromeVersion.error}{' '}
                  <a href='https://www.google.com/chrome/' onClick={inExternal}>
                    Download Google Chrome
                  </a>
                </span>
              ) : chromeVersion.value ? (
                chromeVersion.value
              ) : (
                <CircularProgress size='0.8em' />
              )}
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Installed Chromedriver Version</FormLabel>
            </Grid>
            <Grid item xs={8} style={{ minHeight: '4em' }}>
              <span>
                {installedDriverVersion.error ? (
                  <span style={{ color: theme.palette.error.main }}>
                    {'' + installedDriverVersion.error}
                  </span>
                ) : installedDriverVersion.value ? (
                  installedDriverVersion.value
                ) : (
                  <CircularProgress size='small' />
                )}
              </span>
            </Grid>

            <Grid item xs={4}>
              <FormLabel>Latest Chromedriver Version</FormLabel>
            </Grid>
            <Grid item xs={8} style={{ minHeight: '4em' }}>
              <span>
                {latestDriverVersion.error ? (
                  <span style={{ color: theme.palette.error.main }}>
                    Could not GET latest chromedriver version. {'' + latestDriverVersion.error}
                  </span>
                ) : latestDriverVersion.value ? (
                  <>
                    <div>{latestDriverVersion.value}</div>
                    <div>
                      {canInstall && (
                        <>The latest driver version does not match the installed one.</>
                      )}
                    </div>
                  </>
                ) : (
                  <CircularProgress size='small' />
                )}
              </span>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => updateVersions()}>Recheck Chrome Versions</Button>
          <Button
            disabled={!canInstall}
            onClick={() => installChromeDriver(latestDriverVersion.value!).then(updateVersions)}
            variant='contained'
            color='primary'
          >
            Install Chromedriver
          </Button>
          <Button onClick={(_) => done()} color='primary'>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    )
  },
)