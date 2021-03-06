// npm libraries
const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const convert = require('koa-convert')
const logger = require('koa-logger')
const mongoose = require('mongoose')
const session = require('koa-generic-session')
const passport = require('koa-passport')
const mount = require('koa-mount')
const serve = require('koa-static')
const cors = require('kcors')

// Local libraries
const config = require('../config') // this first.
const adminLib = require('../src/lib/admin')
const errorMiddleware = require('../src/middleware')
const wlogger = require('../src/lib/wlogger')

const BCHJSLIB = require('../src/lib/bch')
const bchjsLib = new BCHJSLIB()

const TUSLIB = require('../src/lib/tus-node-server')
const tusLib = new TUSLIB()

async function startServer () {
  // Create a Koa instance.
  const app = new Koa()
  app.keys = [config.session]

  // Connect to the Mongo Database.
  mongoose.Promise = global.Promise
  mongoose.set('useCreateIndex', true) // Stop deprecation warning.
  await mongoose.connect(
    config.database,
    {
      useUnifiedTopology: true,
      useNewUrlParser: true,
      useFindAndModify: false
    }
  )

  // MIDDLEWARE START

  app.use(convert(logger()))
  app.use(bodyParser())
  app.use(session())
  app.use(errorMiddleware())

  // Used to generate the docs.
  app.use(mount('/', serve(`${process.cwd()}/docs`)))

  // Mount the page for displaying logs.
  app.use(mount('/logs', serve(`${process.cwd()}/config/logs`)))

  // User Authentication
  require('../config/passport')
  app.use(passport.initialize())
  app.use(passport.session())

  // Custom Middleware Modules
  const modules = require('../src/modules')
  modules(app)

  // Enable CORS for testing
  // THIS IS A SECURITY RISK. COMMENT OUT FOR PRODUCTION
  app.use(cors({ origin: '*' }))

  // MIDDLEWARE END

  console.log(`Running server in environment: ${config.env}`)
  wlogger.info(`Running server in environment: ${config.env}`)

  await app.listen(config.port)
  console.log(`Server started on ${config.port}`)

  // Create the system admin user.
  const success = await adminLib.createSystemUser()
  if (success) console.log('System admin user created.')

  await tryCreateWallet()

  // Cleanup the files every 24 hours.
  setInterval(async () => {
    wlogger.info('Cleaning up files...')
    await tusLib.cleanUp()
  }, 60000 * 60 * 24)

  // sweep derived addresses
  setInterval(async function () {
    // console.log('Starting Sweep')
    await bchjsLib.paymentsSweep()
    // console.log('Sweep Done!')
    console.log(' ')
  // }, 60000 * 2) // 2 minutes
  }, 30000) // 30 seconds

  return app
}

// Create the wallet if it doesn't exist
const tryCreateWallet = async () => {
  try {
    const walletPath = `${__dirname}/../config/wallet`
    await bchjsLib.createWallet(walletPath)
  } catch (error) {
    if (error.message && error.message.includes('already exist')) {
      console.log('You have a wallet created already')
    } else throw error
  }
}

// startServer()

// export default app
// module.exports = app
module.exports = {
  startServer
}
