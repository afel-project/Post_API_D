# Post_API_D
API to post content from Didactialia to the AFEL data platform

This part of the AFEL Data platform corresponds to the code that, when receiving new activities from Didactalia will:
   - index the activity into the appropriate activity index on ElasticSearch
   - Perform some basic analysis of the resource and index that too
   
This is mostly made of two resources:
   - A NodeJS script that create a server to receive the activity data (on port 8085)
   - A python script creating a server that will process the resource data (on port 8086)
   
To install, you will need to install a few dependencies both for NodeJS and python (using npm and pip). It should not be too hard to figure out which.

You might want to modify the files config.js and config.py which include parameters such as the location of the ElasticSearch server.

Neither of those script take any parameter, so running them is straightforward. They write onto the console.

Didactalia has to be configured to send the data to the right place. We use a reverse proxy so not to give access to the port directly. 
So, assuming that Didactalia would send the activity data to https://my.didactalia.net/api/post/ the configuration of the virtual host my.didactalia.net for SSL on Apache2 would include something like:

	ProxyPass /api/post http://127.0.0.1:8085
	ProxyPassReverse /api/post http://127.0.0.1:8085

Assuming there relevant modules are enabled and active. 
   
