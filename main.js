const { WebClient } = require('@slack/client');
const _ = require('underscore');
const geoip = require('geoip-lite');
const columnify = require('columnify');
const moment = require('moment');
const useragent = require('useragent');
const yargs = require('yargs');

// An access token (from your Slack app or custom integration - xoxp, xoxb, or xoxa)
const token = process.env.SLACK_TOKEN;


const storyboard = require('storyboard');
const mainStory = storyboard.mainStory;

const web = new WebClient(token);

require('storyboard-preset-console');

// This argument can be a channel ID, a DM ID, a MPDM ID, or a group ID

function fetchLogs(query, page) {
    mainStory.debug(`fetching access logs at page: ${page}`);
    return web.team.accessLogs({ page: page, count: query.count });
}

function processLogs(query, res) {
    let logins = res.logins;
    if (query.username) {
        logins = _.filter(logins, (login) => login.username == query.username);
    }
    _.map(logins, (login) => {
        const geo = geoip.lookup(login.ip);
        login.city = geo.city;
        login.country = geo.country;
        login.date = moment.unix(login.date_first).format('YYYY-MM-DD kk:mm');
        login.fromNow = moment.unix(login.date_first).fromNow();

        const agent = useragent.parse(login.user_agent);
        login.os = agent.os.toString();
    });
    res.logins = logins;
    return res;
}

function queryLogs(query, page, logs = [])  {
    return fetchLogs(query, page).then((res) => {
        res = processLogs(query, res);
        logs.push.apply(logs, res.logins);
        if (res.paging.page + 1 < query.pages && res.paging.page < res.paging.pages) {
            return queryLogs(query, res.paging.page + 1, logs);
        }
        return Promise.resolve(logs)
    });
}


const page = 1;

yargs.command('logs [username]', 'fetch the logs', (yargs) => {
    yargs.positional('username', {
        describe: 'the username to filter',
        default: null
      })
  }, (argv) => {
    queryLogs(argv, page).then((logins) => {
        var columns = columnify(logins, {
            columnSplitter: ' | ',
            columns: ['date', 'fromNow', 'count', 'username', 'ip', 'isp', 'country', 'city', 'os']
        })
        console.log(columns);
    });
  })
  .option('verbose', { alias: 'v', default: false })
  .option('pages', { alias: 'p', default: 1 })
  .option('count', { alias: 'c', default: 1000 })
    .argv
