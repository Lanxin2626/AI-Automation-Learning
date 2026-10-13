const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());


app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.get('/api/user', async (req, res) => {
  try {
    const response = await fetch(
      'https://jsonplaceholder.typicode.com/users/1'
    );

    const data = await response.json();

    res.json({
      success: true,
      "name": data.name,
      "email": data.email,
      "city": data.address.city
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch user data.'
    });
  }
});

app.get('/api/test-key', (req, res) => {
  const apiKey = process.env.API_KEY;

  res.json({
    success: true,
    keyLoaded: !!apiKey
  });
});

app.get('/api/info', (req, res) => {
  const appName = process.env.APP_NAME;
  const appVersion = process.env.APP_VERSION;

  res.json({
    success: true,
    name: appName,
    version: appVersion
  });
});



app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});