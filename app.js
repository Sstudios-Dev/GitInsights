const express = require('express');
const axios = require('axios');
const path = require('path');
const NodeCache = require('node-cache');
const colors = require('colors');
const db = require('./src/extension/db');
const QuickChart = require('quickchart-js'); // Importar QuickChart correctamente
const fs = require('fs');

const app = express();
const PORT = 8080;
const cache = new NodeCache({ stdTTL: 600 }); // Cache data for 10 minutes

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use(express.static(path.join(__dirname, 'src', 'public')));
app.use(express.json()); // Middleware to parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Middleware to parse URL-encoded bodies

function generateRandomString(length = 6) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

app.get('/api/repositories/count', async (req, res) => {
  try {
    const count = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) AS count FROM repos', (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count);
        }
      });
    });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/generate-url', (req, res) => {
  const { repo } = req.body;
  if (!repo) {
    return res.status(400).json({ error: 'Repository name is required' });
  }
  const randomString = generateRandomString();
  cache.set(randomString, repo); // Cache the repository name with the random string as the key
  res.json({ randomString });
});

app.get('/stats/:randomString', async (req, res) => {
  const randomString = req.params.randomString;
  const repo = cache.get(randomString);
  if (!repo) {
    return res.status(400).render('error-400');
  }

  let data;
  const cachedData = cache.get(repo);
  if (cachedData) {
    data = cachedData;
  } else {
    const repoFromDB = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM repos WHERE full_name = ?`, [repo], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    if (repoFromDB) {
      data = repoFromDB;
    } else {
      try {
        const response = await axios.get(`https://api.github.com/repos/${repo}`);
        data = response.data;
        cache.set(repo, data);
        db.serialize(() => {
          const stmt = db.prepare(`INSERT INTO repos (name, full_name, html_url, description, forks_count, stargazers_count, watchers_count, created_at, updated_at, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          stmt.run(data.name, data.full_name, data.html_url, data.description, data.forks_count, data.stargazers_count, data.watchers_count, data.created_at, data.updated_at, data.language);
          stmt.finalize();
        });
      } catch (error) {
        return res.status(500).render('error-500');
      }
    }
  }

  const chartImagePath = await generateChart(data);
  res.render('stats', { repo: data, url: `https://github.com/${repo}`, chartImagePath });
});

async function generateChart(data) {
  try {
    // Set chart configuration
    const chartConfig = {
      type: 'bar',
      data: {
        labels: ['Stars', 'Forks', 'Watchers'],
        datasets: [{
          label: 'Repository Statistics',
          data: [data.stargazers_count, data.forks_count, data.watchers_count],
          backgroundColor: [
            'rgba(75, 192, 192, 0.7)',
            'rgba(255, 159, 64, 0.7)',
            'rgba(153, 102, 255, 0.7)'
          ],
          borderColor: [
            'rgba(75, 192, 192, 1)',
            'rgba(255, 159, 64, 1)',
            'rgba(153, 102, 255, 1)'
          ],
          borderWidth: 1
        }]
      },
      options: {
        scales: {
          yAxes: [{
            ticks: {
              beginAtZero: true,
              fontColor: 'rgba(0, 0, 0, 0.7)'
            },
            gridLines: {
              color: 'rgba(0, 0, 0, 0.1)'
            }
          }],
          xAxes: [{
            ticks: {
              fontColor: 'rgba(0, 0, 0, 0.7)'
            },
            gridLines: {
              color: 'rgba(0, 0, 0, 0.1)'
            }
          }]
        },
        legend: {
          labels: {
            fontColor: 'rgba(0, 0, 0, 0.7)'
          }
        }
      }
    };

    // Fetch chart image
    const chartImageUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

    // Fetch image data
    const response = await axios.get(chartImageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data, 'binary');

    // Define chart image path
    const chartImagePath = path.join(__dirname, 'src', 'public', 'charts', `${data.full_name.replace('/', '-')}.png`);

    // Write image data to file
    fs.writeFileSync(chartImagePath, imageBuffer);

    return `/charts/${data.full_name.replace('/', '-')}.png`;
  } catch (error) {
    console.error('Error generating chart:', error);
    throw error;
  }
}

// information this is not relevant

const repository = 'https://github.com/Sstudios-Dev/GitInsights';
const libraries = ['Node.js', 'Express', 'Axios', 'SQLite3', 'Node Cache', 'QuickChart'];

app.listen(PORT, () => {
  console.log('Server is running.'.green);
  console.log(`You can access the application at http://localhost:${PORT}`.blue);
  console.log(`Repository: ${repository}`.magenta);
  console.log(`Libraries used: ${libraries.join(', ')}`.yellow);
});
