# PulumiCICS
To complete Pulumi case study

To setup k8s infrastructure use 
Change directory to casestudy-gke and init pulumi project
`cd casestudy-gke`
`pulumi stack init`

`npm install`

`pulumi stack output kubeconfig --show-secrets > kubeconfig`

`export KUBECONFIG=$PWD/kubeconfig`