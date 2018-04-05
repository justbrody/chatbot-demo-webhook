const express = require('express')
const app = express()
var bodyParser = require('body-parser')
const Client = require('node-rest-client').Client

const PORT = 8081
var client = new Client()

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.post('/action', (req, res) => {
  res.set('Content-Type', 'application/json')
  processV1Request(req, res)
})

app.all('/', (req, res) => res.send('Chatbot-demo webhook.'))

app.listen(PORT, () => console.log(`Chatbot-demo webhook on port ${PORT}!`))

/*
* Function to handle v1 webhook requests from Dialogflow
*/
function processV1Request (request, response) {
  let action = request.body.result.action
  let parameters = request.body.result.parameters
  let apiUrl = 'http://localhost:8080'

  function sendResponse (responseToUser) {
    // if the response is a string send it as a response to the user
    if (typeof responseToUser === 'string') {
      let responseJson = {}
      responseJson.speech = responseToUser // spoken response
      responseJson.displayText = responseToUser // displayed response
      response.json(responseJson) // Send response to Dialogflow
    } else {
      // If the response to the user includes rich responses or contexts send them to Dialogflow
      let responseJson = {}
      // If speech or displayText is defined, use it to respond (if one isn't defined use the other's value)
      responseJson.speech = responseToUser.speech || responseToUser.displayText
      responseJson.displayText = responseToUser.displayText || responseToUser.speech
      // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
      responseJson.data = responseToUser.data
      responseJson.followupEvent = responseToUser.followupEvent
      responseJson.messages = responseToUser.messages
      // Optional: add contexts (https://dialogflow.com/docs/contexts)
      responseJson.contextOut = responseToUser.outputContexts
      response.json(responseJson) // Send response to Dialogflow
    }
  }

  let unknowIntent = () => sendResponse('Probeer het opnieuw.')

  let sayWelcome = () => sendResponse('Hallo, welkom in de USER chatbot')

  let defaultMessage = () => sendResponse('Probeer het opnieuw.')

  let saveInAlcoholschrift = () => {
    let responseToUser = {
      speech: '',
      text: '',
      messages: [
        {
          type: 0,
          speech: 'Ik heb het toegevoegd aan het alcoholschrift.'
        },
        {
          type: 0,
          speech: 'Dat wel erg veel, het lijkt me verstandig om even met je behandelaar te praten.'
        },
        {
          type: 2,
          title: 'zal ik je behandelaar vragen om je te bellen?',
          replies: [ 'Ja', 'Nee' ]
        }
      ]
    }
    sendResponse(parameters.aantal > 4 ? responseToUser : 'Ik heb het toegevoegd aan het alcoholschrift')
  }

  let callBehandelaar = () => {
    let response = {
      followupEvent:
                {
                  name: 'BEHANDELAAR_SPREKEN',
                  data: { 'reden': 'teveel gedronken' }
                }
    }
    sendResponse(response)
  }

  let saveNotitie = () => {
    var args = {
      data: { clientId: parseInt(parameters.clientId), text: parameters.text, appointmentId: parameters.appointmentId != null ? parseInt(parameters.appointmentId) : null },
      headers: { 'Content-Type': 'application/json' }
    }
    console.log(JSON.stringify(args))

    client.put(`${apiUrl}/text/save`, args, function (data, response) {
      sendResponse('Ik heb het voor u opgeslagen.')
    })
  }

  let checkClient = () => {
    client.get(`${apiUrl}/clients?name=${parameters.client}`,
      (data, response) => {
        let replies = data.map(c => c.name)

        let responseToUser = data.length > 0
          ? {
            speech: '',
            text: '',
            messages: [
              {
                type: 2,
                title: data.length > 1 ? 'Ik heb meerdere clienten gevonden, welke bedoelt u?' : 'Bedoelt u?',
                replies: replies
              }
            ]
          } : {
            text: 'Helaas heb ik de client niet kunnen vinden.',
            followupEvent:
                            {
                              name: 'notitie-toevoegen',
                              data: { 'reden': 'niet gevonden' }
                            }
          }
        sendResponse(responseToUser)
      })
  }

  let askAfspraakOrVoortgang = () => {
    client.get(`${apiUrl}/clients?name=${parameters.client}`,
      (data, response) => {
        let client = data[ 0 ]

        let responseToUser = {
          speech: '',
          text: '',
          messages: [
            {
              type: 2,
              title: 'Wilt een losse voortgang of voor de laatste afspraak van ' + client.lastAppointmentDate + '?',
              replies: [ 'voortgang', 'afspraak' ]
            }
          ],
          outputContexts: [
            {
              'name': 'valid-client',
              'lifespan': 5,
              'parameters': {
                'clientId': client.id,
                'appointmentId': '' + client.lastAppointment + '',
                'appointmentDate': client.lastAppointmentDate
              }
            }
          ]
        }
        sendResponse(responseToUser)
      })
  }

  const actionHandlers = {
    'input.welcome': sayWelcome,
    'notitie.check-client': checkClient,
    'notitie-toevoegen.notitie-toevoegen-opvoeren': saveNotitie,
    'notitie-toevoegen.notitie-toevoegen-valideer-client.notitie-toevoegen-valideer-client-opvoeren-voortgang': saveNotitie,
    'notitie-toevoegen.notitie-toevoegen-valideer-client.notitie-toevoegen-valideer-client-opvoeren-afspraak': saveNotitie,
    'notitie-toevoegen.notitie-toevoegen-valideer-client': askAfspraakOrVoortgang,
    'vastlegging-alcoholschrift.bellenBehandelaar': callBehandelaar,
    'input.alcoholschrift': saveInAlcoholschrift,
    'input.unknown': unknowIntent,
    'default': defaultMessage
  }
  // If undefined or unknown action use the default handler
  if (!actionHandlers[ action ]) {
    action = 'default'
  }
  // Run the proper handler function to handle the request from Dialogflow
  actionHandlers[ action ]()
}
