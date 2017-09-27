const slack = require('@slack/client');

const Promise = require('bluebird');
const request = require('request-promise');
const truncate = require('truncate');
const winston = require('winston');


const web = new slack.WebClient(process.env.SLACK_TOKEN);
const rtm = new slack.RtmClient(process.env.SLACK_TOKEN, {dataStore: new slack.MemoryDataStore(), autoReconnect: true});


const JIRA_HOSTNAME = process.env.JIRA_HOSTNAME;
const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_PASSWORD = process.env.JIRA_PASSWORD;

const REPORT_CHANNEL = process.env.REPORT_CHANNEL;

const TICKET_FILTER = process.env.TICKET_FILTER;


winston.info(`JIRA hostname: ${JIRA_HOSTNAME}`);
winston.info(`Report channel: ${REPORT_CHANNEL}`);
winston.info(`Ticket filter: ${TICKET_FILTER}`);


const slackSendMessage = (text) => {
  return new Promise( (resolve, reject) => {
    const channel = rtm.dataStore.getChannelByName(process.env.REPORT_CHANNEL);
    rtm.sendMessage(text, channel.id, () => {
      resolve();
    });
  });
};


rtm.on(slack.CLIENT_EVENTS.RTM.AUTHENTICATED, (startData) => {
  winston.info(`Logged into Slack as ${startData.self.name}`);
});


rtm.on(slack.CLIENT_EVENTS.RTM.DISCONNECT, () => {
  winston.info(`Disconnected from Slack`);
});


rtm.on(slack.CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, Promise.coroutine(function* () {

  const filterUrl = `https://${JIRA_HOSTNAME}/rest/api/2/filter/${TICKET_FILTER}`;
  const filterResponse = yield request.get(filterUrl).auth(JIRA_USERNAME, JIRA_PASSWORD);
  const filterData = JSON.parse(filterResponse);
  const queryName = filterData.name;
  const queryLink = `https://${JIRA_HOSTNAME}/issues/?filter=${TICKET_FILTER}`;
  const queryUrl = filterData.searchUrl + '&maxResults=999999';

  winston.info(`Executing ticket filter ${TICKET_FILTER}`);
  const queryResponse = yield request.get(queryUrl).auth(JIRA_USERNAME, JIRA_PASSWORD);
  const queryData = JSON.parse(queryResponse);
  const tickets = [];
  for (const issue of queryData.issues) {
    const key = issue.key;
    const link = `https://${JIRA_HOSTNAME}/browse/${key}`;
    const summary = truncate(issue.fields.summary, 70);
    tickets.push(`> ${key}: ${summary} (${link})`);
  }

  const numTickets = tickets.length;
  const ticketsText = numTickets ? tickets.join('\n') : '> No tickets found';
  const text = `*${queryName}: ${numTickets}*\n(${queryLink})\n${ticketsText}`;

  winston.info(`Sending message to Slack\n${text}`);
  yield slackSendMessage(text);

  rtm.disconnect();

}));


rtm.start();
