import express from 'express';
import { homedir } from 'os';
import { join } from 'path';
import repl, { type REPLCommand } from 'repl';
import { inspect, promisify } from 'util';
import { getLocations } from './get-poi';
import { getRedisClient } from './redis-client';


export async function setupServer() {
  const client = await getRedisClient();
  const locationKeys = await client.keys('locations*');
  const categories = locationKeys.map(l => l.split("|").pop());

  const app = express()
  const port = 3000

  app.get('/poi', async (req, res) => {
    const { long, lat } = req.query;
    if (long === undefined || lat === undefined) {
      return res.status(501).send('please provide lat/long query aregs');
    }
    res.json(await getLocations(lat as string, long as string));
  })

  app.listen(port, () => {
    console.log(`Listening on ${port}`)
  })
}
export async function setupRepl() {
  const client = await getRedisClient();
  const locationKeys = await client.keys('locations*');
  const categories = locationKeys.map(l => l.split("|").pop());


  const replServer = repl.start({ prompt: '> ' });
  await promisify(replServer.setupHistory.bind(replServer))(join(homedir(), '.wip-history'));

  const defineCommand = (keyword: string, cmd: REPLCommand) => {
    const action = cmd.action;
    cmd.action = async function (argument: string): Promise<void> {
      console.time(keyword);
      replServer.clearBufferedCommand();
      try {
        await action.call(replServer, argument);
      } catch (e) {
        console.error(`An error occured: ${inspect(e)}`);
      }
      console.timeEnd(keyword);
      replServer.displayPrompt();
    };
    replServer.defineCommand(keyword, cmd);
  };

  defineCommand('poi', {
    help: 'Returns the poi around the provided latitude longitude',
    action: async function (argument: string) {
      const [lat, long] = argument.split(/\s+/);
      console.info(await getLocations(lat, long));
    }
  });
}
