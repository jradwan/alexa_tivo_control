# python channels.json generator for UK Virgin Tivo
# Script needs requests and beautifulSoup packages
import requests
from bs4 import BeautifulSoup

firstline = True;

def printData(section, genere):
    global firstline
    for row in section:
        if (len(row.find_all("th"))) <1:
            # Only process if we dont get headers
            channelNumber = row.contents[1].get_text()
            channelName = row.contents[3].get_text()
            if not firstline:
                print(",")
            print("  {{ \"name\":\"{}\", \"alias\":\"{}\", \"channel\":{}, \"pronounce\":\"{}\", \"genre\":\"{}\" }}".format(channelName, channelName, channelNumber, channelName, genere),end='')
            firstline=False


cont = requests.get('https://www.tvchannellists.com/List_of_channels_on_Virgin_Media_(UK)').content
tvdata = BeautifulSoup(cont, "lxml")
print("[")
printData(tvdata.find(id="Entertainment").parent.next_sibling.next_sibling.find_all('tr'), "Entertainment")
printData(tvdata.find(id="Factual").parent.next_sibling.next_sibling.find_all('tr'), "Factual")
printData(tvdata.find(id="Lifestyle").parent.next_sibling.next_sibling.find_all('tr'), "Lifestyle")
printData(tvdata.find(id="Music").parent.next_sibling.next_sibling.find_all('tr'), "Music")
printData(tvdata.find(id="Movies").parent.next_sibling.next_sibling.find_all('tr'), "Movies")
printData(tvdata.find(id="Sport").parent.next_sibling.next_sibling.find_all('tr'), "Sport")
printData(tvdata.find(id="News").parent.next_sibling.next_sibling.find_all('tr'), "News")
printData(tvdata.find(id="Kids").parent.next_sibling.next_sibling.find_all('tr'), "Kids")
printData(tvdata.find(id="Shopping").parent.next_sibling.next_sibling.find_all('tr'), "Shopping")
printData(tvdata.find(id="International").parent.next_sibling.next_sibling.find_all('tr'), "International")
print("\n]")
