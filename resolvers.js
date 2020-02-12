import { PubSub, withFilter } from "apollo-server-express";

export const pubsub = new PubSub();

const AVAILIBLE_RESOURCES_SUBSCRIPTION = "AVAILIBLE_RESOURCES_SUBSCRIPTION";
const BOUGHT_RESOURCES_SUBSCRIPTION = "BOUGHT_RESOURCES_SUBSCRIPTION";
const SOLD_RESOURCES_SUBSCRIPTION = "SOLD_RESOURCES_SUBSCRIPTION";
const USERS_CHANGED = "USERS_CHANGED";

export const resolvers = {
  Subscription: {
    availibleResourcesChanged: {
      subscribe: () => pubsub.asyncIterator([AVAILIBLE_RESOURCES_SUBSCRIPTION])
    },
    boughtResource: {
      subscribe: () => pubsub.asyncIterator([BOUGHT_RESOURCES_SUBSCRIPTION])
    },
    soldResource: {
      subscribe: () => pubsub.asyncIterator([SOLD_RESOURCES_SUBSCRIPTION])
    },
    usersChanged: {
      subscribe: () => pubsub.asyncIterator([USERS_CHANGED])
    }
  },
  Mutation: {
    orderResource: (parent, { userId, qty }, { db }) => {
      const resources = db.get("resources");
      const resource = resources.find({ userId: userId });
      const resourceToBuy = resource.value().toBuy;
      const prevResource = resources.find({ userId: userId - 1 });
      const prevResDeliveryTime = prevResource.value().deliveryTime;
      const deliveryTime = resource.value().deliveryTime;
      const prevResToSell = prevResource.value().toSell;

      if (prevResource.value().toSell - qty <= 0) {
        const sold = prevResource
          .assign({
            toSell: prevResToSell - prevResToSell
          })
          .write();
        const bought = resource
          .assign({ toBuy: qty - prevResToSell + resourceToBuy })
          .write();
        if (prevResToSell) {
          pubsub.publish(BOUGHT_RESOURCES_SUBSCRIPTION, {
            boughtResource: [
              { userId, qty: prevResToSell, deliveryTime: prevResDeliveryTime }
            ]
          });
          pubsub.publish(SOLD_RESOURCES_SUBSCRIPTION, {
            soldResource: [
              {
                userId: userId - 1,
                qty: prevResToSell,
                deliveryTime: prevResDeliveryTime
              }
            ]
          });
        }
        pubsub.publish(AVAILIBLE_RESOURCES_SUBSCRIPTION, {
          availibleResourcesChanged: db.get("resources").value()
        });
        return db.get("resources").value();
      } else {
        const sold = prevResource
          .assign({ toSell: prevResToSell - qty })
          .write();

        const bought = resource.assign({ toBuy: qty - qty }).write();

        if (qty) {
          pubsub.publish(BOUGHT_RESOURCES_SUBSCRIPTION, {
            boughtResource: [{ userId, qty, deliveryTime: prevResDeliveryTime }]
          });
          pubsub.publish(SOLD_RESOURCES_SUBSCRIPTION, {
            soldResource: [
              { userId: userId - 1, qty, deliveryTime: prevResDeliveryTime }
            ]
          });
        }
        pubsub.publish(AVAILIBLE_RESOURCES_SUBSCRIPTION, {
          availibleResourcesChanged: db.get("resources").value()
        });
        return db.get("resources").value();
      }
    },
    sellResources: (parent, { userId, qty }, { db }) => {
      const resources = db.get("resources");
      const resource = resources.find({ userId: userId });
      const resourceToSell = resource.value().toSell;
      const nextResource = resources.find({ userId: userId + 1 });
      const nextResToBuy = nextResource.value().toBuy;
      const deliveryTime = resource.value().deliveryTime;

      if (nextResToBuy - qty <= 0) {
        const sold = resource
          .assign({
            toSell: qty - nextResToBuy + resourceToSell
          })
          .write();
        const bought = nextResource
          .assign({ toBuy: nextResToBuy - nextResToBuy })
          .write();
        if (nextResToBuy) {
          pubsub.publish(BOUGHT_RESOURCES_SUBSCRIPTION, {
            boughtResource: [
              { userId: userId + 1, qty: nextResToBuy, deliveryTime }
            ]
          });
          pubsub.publish(SOLD_RESOURCES_SUBSCRIPTION, {
            soldResource: [{ userId, qty: nextResToBuy, deliveryTime }]
          });
        }
        pubsub.publish(AVAILIBLE_RESOURCES_SUBSCRIPTION, {
          availibleResourcesChanged: db.get("resources").value()
        });

        return db.get("resources").value();
      } else {
        const sold = resource
          .assign({ toSell: resourceToSell - resourceToSell })
          .write();

        const bought = nextResource
          .assign({ toBuy: nextResToBuy - qty })
          .write();
        if (qty) {
          pubsub.publish(BOUGHT_RESOURCES_SUBSCRIPTION, {
            boughtResource: [{ userId: userId + 1, qty, deliveryTime }]
          });
          pubsub.publish(SOLD_RESOURCES_SUBSCRIPTION, {
            soldResource: [{ userId, qty, deliveryTime }]
          });
        }
        pubsub.publish(AVAILIBLE_RESOURCES_SUBSCRIPTION, {
          availibleResourcesChanged: db.get("resources").value()
        });
        return db.get("resources").value();
      }
    },
    addResourcesToBuy: (parent, { userId, qty }, { db }) => {
      const resources = db.get("resources");
      resources.find({ userId }).assign({ qty });

      pubsub.publish(AVAILIBLE_RESOURCES_SUBSCRIPTION, {
        availibleResourcesChanged: resources.value()
      });
      db.write();
      return {
        message: "Resource added",
        resources: resources.value()
      };
    },
    buyResource: (parent, { userId, qty }, { db }) => {
      const database = db;
      const resources = database.get("resources");
      const resourceToChange = resources.find({ userId: userId - 1 });
      const newResourceQty = resourceToChange.value().qty - qty;
      const newRes = resourceToChange.assign({ qty: newResourceQty }).write();
      pubsub.publish(AVAILIBLE_RESOURCES_SUBSCRIPTION, {
        availibleResourcesChanged: resources
          .value()
          .map(res => (res.userId === userId ? newRes : res))
      });

      return {
        message: "Bought resources",
        resource: { ...newRes, qty, userId }
      };
    },
    setUserTaken: (parent, { userId }, { db }) => {
      const users = db.get("users").value();
      const user = db
        .get("users")
        .find({ id: userId })
        .value();

      if (!user.taken) {
        db.get("users")
          .find({ id: userId })
          .assign({ taken: true })
          .write();

        pubsub.publish(USERS_CHANGED, {
          usersChanged: db
            .get("users")
            .filter(usr => usr.id !== 0)
            .filter(usr => usr.id !== users.length - 1)
            .value()
        });

        return true;
      }
      return false;
    }
  },
  Query: {
    resources: (parent, arg, { db }) => {
      return db.get("resources").value();
    },
    users: (parent, arg, { db }) => {
      const users = db.get("users").value();

      return db
        .get("users")
        .filter(usr => usr.id !== 0)
        .filter(usr => usr.id !== users.length - 1)
        .value();
    }
  }
};
