# Burnbank Blues - Match Records Website

A simple website to track football match results and player statistics for Burnbank Blues.

## Quick Start

1. Open `index.html` in your web browser
2. Start recording matches and goalscorers!

## Features

✅ **Add Match Records**: Enter opponent team, match score, and date
✅ **Record Goalscorers**: Track which players scored and how many goals
✅ **Top Scorers Table**: View running total of goals for each player across all matches
✅ **Match History**: View all recorded matches with details
✅ **Data Persistence**: All data is saved in your browser (LocalStorage)
✅ **Delete Records**: Remove individual matches if needed
✅ **Clear All**: Option to clear all data

## How to Use

### Adding a Match

1. Fill in the **Opponent Team** name
2. Enter **Burnbank Blues Score** and **Opponent Score**
3. Select the **Match Date**
4. Enter **Goalscorers** in format: `Player Name: Goals, Another Player: Goals`
   - Example: `John Smith: 2, Sarah Jones: 1`
   - The total goals must match Burnbank Blues score
5. Click **Add Match**

### Viewing Statistics

- **Top Goalscorers**: Shows a ranked list of all players and their total goals
- **Match History**: Displays all matches in reverse chronological order
- Matches show the result (Win/Loss/Draw), date, and goalscorer details

### Managing Data

- **Delete Match**: Click the Delete button on any match to remove it
- **Clear All Data**: Use the "Clear All Data" button to reset everything (be careful!)

## Files

- `index.html` - Main page structure
- `styles.css` - Styling and responsive design
- `script.js` - Match management and data handling

## Browser Storage

Data is stored in your browser's localStorage. This means:
- ✅ Data persists between sessions
- ✅ No server or account needed
- ⚠️ Data is lost if you clear browser history/cache
- ⚠️ Data is browser-specific (won't sync across devices)

## Notes

- The goalscorers format is flexible - just separate player entries with commas
- You can have multiple players score in a match
- The running total automatically calculates across all matches entered
