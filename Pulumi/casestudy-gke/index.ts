import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as path from "path";

const name = "casestudy";

const config = new pulumi.Config();
export const masterVersion = config.get("masterVersion") ||
    gcp.container.getEngineVersions().then(it => it.latestMasterVersion);

// Create a GKE cluster
const cluster = new gcp.container.Cluster(name, {
    initialNodeCount: 1,
    removeDefaultNodePool: true,

    minMasterVersion: masterVersion,
});

const nodePool = new gcp.container.NodePool(`primary-node-pool`, {
    cluster: cluster.name,
    initialNodeCount: 1,
    location: cluster.location,
    nodeConfig: {
        preemptible: true,
        machineType: "n1-standard-1",
        oauthScopes: [
            "https://www.googleapis.com/auth/compute",
            "https://www.googleapis.com/auth/devstorage.read_only",
            "https://www.googleapis.com/auth/logging.write",
            "https://www.googleapis.com/auth/monitoring",
        ],
    },
    version: masterVersion,
    management: {
        autoRepair: true,
    },
}, {
    dependsOn: [cluster],
});

// Export the Cluster name
export const clusterName = cluster.name;

export const kubeconfig = pulumi.
    all([ cluster.name, cluster.endpoint, cluster.masterAuth ]).
    apply(([ name, endpoint, masterAuth ]) => {
        const context = `${gcp.config.project}_${gcp.config.zone}_${name}`;
        return `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${masterAuth.clusterCaCertificate}
    server: https://${endpoint}
  name: ${context}
contexts:
- context:
    cluster: ${context}
    user: ${context}
  name: ${context}
current-context: ${context}
kind: Config
preferences: {}
users:
- name: ${context}
  user:
    auth-provider:
      config:
        cmd-args: config config-helper --format=json
        cmd-path: gcloud
        expiry-key: '{.credential.token_expiry}'
        token-key: '{.credential.access_token}'
      name: gcp
`;
    });

// Create a Kubernetes provider instance that uses our cluster from above.
const clusterProvider = new k8s.Provider(name, {
    kubeconfig: kubeconfig,
}, {
  dependsOn: [nodePool],
});

//create nginx ingress
const nginxClass = new k8s.yaml.ConfigFile("nginxclass", {
    file: "nginxClass.yaml",
}, {
    provider: clusterProvider,
});

const ingnginx = nginxClass.getResource("v1/Service", "ingress-nginx-controller");
export const externalIp = ingnginx.spec.externalIPs;

//create sample page
const casestudyApp = new k8s.yaml.ConfigGroup("casestudyApp", {
    files: [ path.join("../sample-yaml", "*.yaml") ],
}, {
    provider: clusterProvider,
    dependsOn: [nginxClass],
});

const app = casestudyApp.getResource("networking.k8s.io/v1/Ingress","phpapp")

