import Fastify, { FastifyInstance, RouteShorthandOptions } from 'fastify'
import fastifystatic from 'fastify-static';
import { Server, IncomingMessage, ServerResponse } from 'http'
import path from 'path';



const server: FastifyInstance = Fastify({ logger: true });

const opts: RouteShorthandOptions = {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          pong: {
            type: 'string'
          }
        }
      }
    }
  }
}

server.register(fastifystatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/', // optional: default '/'
});



server.get('/ping', opts, async (request, reply) => {
  return { pong: 'it worked!' }
})

const start = async () => {
  try {
    await server.listen(5500)

    const address = server.server.address()
    const port = typeof address === 'string' ? address : address?.port

  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}
start()
